import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";
import { updateStock, getProductByLocalId } from "./offlineProductService";
import { addCustomerLedgerEntry, recalculateCustomerBalance } from "./offlineCustomerService";

export interface SaleItem {
  productLocalId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  total: number;
  imeiNumbers: string[];
  variationStorage?: string;
  variationColor?: string;
}

export interface Sale {
  id: string;
  localId: string;
  invoiceNumber: string;
  customerLocalId: string;
  customerName: string;
  customerId: string;
  customerPhone: string;
  items: SaleItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "paid" | "partial" | "pending";
  saleDate: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface SaleReturn {
  id: string;
  localId: string;
  saleLocalId: string;
  saleId: string;
  productLocalId: string;
  productName: string;
  returnQuantity: number;
  returnIMEIs: string[];
  returnReason: string;
  returnDate: string;
  returnAmount: number;
  costPrice: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface SaleDB extends DBSchema {
  sales: { key: string; value: Sale; indexes: { "by-sync": string; "by-customer": string } };
  saleReturns: { key: string; value: SaleReturn; indexes: { "by-sync": string; "by-sale": string } };
}

let dbInstance: IDBPDatabase<SaleDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<SaleDB>("sale-management", 1, {
    upgrade(db) {
      const ss = db.createObjectStore("sales", { keyPath: "localId" });
      ss.createIndex("by-sync", "syncStatus");
      ss.createIndex("by-customer", "customerLocalId");
      const rs = db.createObjectStore("saleReturns", { keyPath: "localId" });
      rs.createIndex("by-sync", "syncStatus");
      rs.createIndex("by-sale", "saleLocalId");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isOnline = () => navigator.onLine;

const generateInvoiceNumber = () => {
  const d = new Date();
  return `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
};

const saveSaleToFirebase = async (s: Sale): Promise<string> => {
  const { localId, syncStatus, id, ...data } = s;
  if (id) {
    await updateDoc(doc(firestore, "sales", id), { ...data, saleDate: Timestamp.fromDate(new Date(s.saleDate)), createdAt: Timestamp.fromDate(new Date(s.createdAt)) });
    return id;
  }
  const ref = await addDoc(collection(firestore, "sales"), { ...data, saleDate: Timestamp.fromDate(new Date(s.saleDate)), createdAt: Timestamp.fromDate(new Date(s.createdAt)) });
  return ref.id;
};

const saveReturnToFirebase = async (r: SaleReturn): Promise<string> => {
  const { localId, syncStatus, id, saleLocalId, productLocalId, ...data } = r;
  const ref = await addDoc(collection(firestore, "saleReturns"), { ...data, returnDate: Timestamp.fromDate(new Date(r.returnDate)), createdAt: Timestamp.fromDate(new Date(r.createdAt)) });
  return ref.id;
};

// Background sync helper
const syncSaleInBackground = async (sale: Sale) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    sale.id = await saveSaleToFirebase(sale);
    sale.syncStatus = "synced";
    await db.put("sales", sale);
  } catch (e) { console.warn("Background sale sync failed:", e); }
};

export const addSale = async (data: {
  customerLocalId: string; customerName: string; customerId: string; customerPhone: string;
  items: SaleItem[]; totalAmount: number; paidAmount: number;
  paymentStatus: "paid" | "partial" | "pending"; saleDate: string;
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const invoiceNumber = generateInvoiceNumber();
  const remaining = data.totalAmount - data.paidAmount;
  const sale: Sale = { ...data, id: "", localId, invoiceNumber, remainingAmount: remaining, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("sales", sale);

  // Then sync to Firebase in background (non-blocking)
  syncSaleInBackground({ ...sale }).catch(console.warn);

  // Update stock & mark IMEIs as sold
  for (const item of data.items) {
    await updateStock(item.productLocalId, -item.quantity);
    if (item.imeiNumbers.length > 0) {
      const productDB = await openDB("product-management", 1);
      for (const imei of item.imeiNumbers) {
        const records = await productDB.getAllFromIndex("imeiRecords", "by-imei", imei);
        for (const r of records) {
          if (r.status === "in_stock") {
            r.status = "sold";
            r.saleLocalId = localId;
            r.syncStatus = "pending";
            await productDB.put("imeiRecords", r);
          }
        }
      }
    }
  }

  // Customer ledger: sale entry
  if (data.customerLocalId) {
    await addCustomerLedgerEntry({
      customerId: data.customerId, customerLocalId: data.customerLocalId,
      date: data.saleDate, type: "sale",
      description: `Sale ${invoiceNumber} - ${data.items.map(i => i.productName).join(", ")}`,
      amount: data.totalAmount,
    });
    if (data.paidAmount > 0) {
      await addCustomerLedgerEntry({
        customerId: data.customerId, customerLocalId: data.customerLocalId,
        date: data.saleDate, type: "payment",
        description: `Payment on ${invoiceNumber}`,
        amount: data.paidAmount,
      });
    }
    await recalculateCustomerBalance(data.customerLocalId);
  }

  return { localId, invoiceNumber, sale };
};

export const addSaleReturn = async (data: {
  saleLocalId: string; saleId: string; productLocalId: string;
  productName: string; returnQuantity: number; returnIMEIs: string[];
  returnReason: string; returnDate: string; returnAmount: number;
  costPrice: number; customerLocalId: string; customerId: string;
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const ret: SaleReturn = {
    id: "", localId, saleLocalId: data.saleLocalId, saleId: data.saleId,
    productLocalId: data.productLocalId, productName: data.productName,
    returnQuantity: data.returnQuantity, returnIMEIs: data.returnIMEIs,
    returnReason: data.returnReason, returnDate: data.returnDate,
    returnAmount: data.returnAmount, costPrice: data.costPrice,
    createdAt: new Date().toISOString(), syncStatus: "pending",
  };

  // Save to IndexedDB FIRST (instant)
  await db.put("saleReturns", ret);

  // Then sync to Firebase in background (non-blocking)
  if (isOnline()) {
    (async () => {
      try {
        const db2 = await getDB();
        ret.id = await saveReturnToFirebase(ret);
        ret.syncStatus = "synced";
        await db2.put("saleReturns", ret);
      } catch (e) { console.warn("Background return sync failed:", e); }
    })();
  }

  // Reverse stock
  await updateStock(data.productLocalId, data.returnQuantity);

  // Mark IMEIs as returned
  if (data.returnIMEIs.length > 0) {
    const productDB = await openDB("product-management", 1);
    for (const imei of data.returnIMEIs) {
      const records = await productDB.getAllFromIndex("imeiRecords", "by-imei", imei);
      for (const r of records) {
        if (r.status === "sold") {
          r.status = "in_stock";
          r.saleLocalId = "";
          r.syncStatus = "pending";
          await productDB.put("imeiRecords", r);
        }
      }
    }
  }

  // Customer ledger: return entry
  if (data.customerLocalId) {
    await addCustomerLedgerEntry({
      customerId: data.customerId, customerLocalId: data.customerLocalId,
      date: data.returnDate, type: "sale_return",
      description: `Return - ${data.productName}`,
      amount: data.returnAmount,
    });
    await recalculateCustomerBalance(data.customerLocalId);
  }

  return localId;
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "sales"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("sales");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("sales", local.localId);
      }
    }

    // Add new records from Firebase (skip if pending records exist to avoid duplicates)
    const remainingLocal = await db.getAll("sales");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of snap.docs) {
      if (!hasPending && !remainingLocal.find(s => s.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("sales", {
          id: docSnap.id, localId: generateLocalId(),
          invoiceNumber: d.invoiceNumber || "", customerLocalId: d.customerLocalId || "",
          customerName: d.customerName || "", customerId: d.customerId || "", customerPhone: d.customerPhone || "",
          items: d.items || [], totalAmount: d.totalAmount || 0, paidAmount: d.paidAmount || 0,
          remainingAmount: d.remainingAmount || 0, paymentStatus: d.paymentStatus || "pending",
          saleDate: d.saleDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced" as const,
        });
      }
    }
  } catch (e) { console.warn("Pull sales failed:", e); }
};

export const getAllSales = async (): Promise<Sale[]> => {
  const db = await getDB();
  pullFromFirebase().catch(console.warn);
  return (await db.getAll("sales")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getSaleReturns = async (saleLocalId: string): Promise<SaleReturn[]> => {
  const db = await getDB();
  await pullSaleReturnsFromFirebase().catch(console.warn);
  return db.getAllFromIndex("saleReturns", "by-sale", saleLocalId);
};

const pullSaleReturnsFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "saleReturns"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("saleReturns");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("saleReturns", local.localId);
      }
    }

    // Add new records from Firebase
    const remainingLocal = await db.getAll("saleReturns");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of snap.docs) {
      if (!hasPending && !remainingLocal.find(r => r.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("saleReturns", {
          id: docSnap.id, localId: generateLocalId(),
          saleLocalId: d.saleLocalId || "", saleId: d.saleId || "",
          productLocalId: d.productLocalId || "", productName: d.productName || "",
          returnQuantity: d.returnQuantity || 0, returnIMEIs: d.returnIMEIs || [],
          returnReason: d.returnReason || "", returnAmount: d.returnAmount || 0,
          costPrice: d.costPrice || 0,
          returnDate: d.returnDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced" as const,
        });
      }
    }
  } catch (e) { console.warn("Pull sale returns failed:", e); }
};

export const getAllSaleReturns = async (): Promise<SaleReturn[]> => {
  const db = await getDB();
  pullSaleReturnsFromFirebase().catch(console.warn);
  return (await db.getAll("saleReturns")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const deleteSale = async (localId: string) => {
  const db = await getDB();
  const sale = await db.get("sales", localId);
  if (!sale) return;

  // Reverse stock first
  for (const item of sale.items) {
    await updateStock(item.productLocalId, item.quantity);
  }

  // Delete from IndexedDB FIRST (instant)
  await db.delete("sales", localId);

  // Then delete from Firebase in background (non-blocking)
  if (sale.id && isOnline()) {
    deleteDoc(doc(firestore, "sales", sale.id)).catch(console.warn);
  }
};

export const syncSales = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("sales", "by-sync", "pending");
  for (const s of pending) {
    try { s.id = await saveSaleToFirebase(s); s.syncStatus = "synced"; await db.put("sales", s); } catch (e) { console.error(e); }
  }
  const pendingReturns = await db.getAllFromIndex("saleReturns", "by-sync", "pending");
  for (const r of pendingReturns) {
    try { r.id = await saveReturnToFirebase(r); r.syncStatus = "synced"; await db.put("saleReturns", r); } catch (e) { console.error(e); }
  }
};

let syncListenerAdded = false;
export const startSaleAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncSales().catch(console.error); });
  if (isOnline()) syncSales().catch(console.error);
};