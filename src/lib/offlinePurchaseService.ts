import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";
import { updateStock, addIMEI, getProductByLocalId } from "./offlineProductService";

export interface PurchaseItem {
  productLocalId: string;
  productName: string;
  quantity: number;
  unitType: "box" | "new" | "used";
  costPrice: number;
  salePrice: number;
  total: number;
  imeiNumbers: string[];
  variationStorage?: string;
  variationColor?: string;
}

export interface Purchase {
  id: string;
  localId: string;
  supplierLocalId: string;
  supplierName: string;
  supplierId: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  paymentStatus: "paid" | "partial" | "pending";
  purchaseDate: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface PurchaseReturn {
  id: string;
  localId: string;
  purchaseLocalId: string;
  purchaseId: string;
  productLocalId: string;
  productName: string;
  returnQuantity: number;
  returnIMEIs: string[];
  returnReason: string;
  returnDate: string;
  returnAmount: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface PurchaseDB extends DBSchema {
  purchases: { key: string; value: Purchase; indexes: { "by-sync": string; "by-supplier": string } };
  purchaseReturns: { key: string; value: PurchaseReturn; indexes: { "by-sync": string; "by-purchase": string } };
}

let dbInstance: IDBPDatabase<PurchaseDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<PurchaseDB>("purchase-management", 1, {
    upgrade(db) {
      const ps = db.createObjectStore("purchases", { keyPath: "localId" });
      ps.createIndex("by-sync", "syncStatus");
      ps.createIndex("by-supplier", "supplierLocalId");

      const rs = db.createObjectStore("purchaseReturns", { keyPath: "localId" });
      rs.createIndex("by-sync", "syncStatus");
      rs.createIndex("by-purchase", "purchaseLocalId");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isOnline = () => navigator.onLine;

const savePurchaseToFirebase = async (p: Purchase): Promise<string> => {
  const { localId, syncStatus, id, ...data } = p;
  if (id) {
    await updateDoc(doc(firestore, "purchases", id), { ...data, purchaseDate: Timestamp.fromDate(new Date(p.purchaseDate)), createdAt: Timestamp.fromDate(new Date(p.createdAt)) });
    return id;
  }
  const ref = await addDoc(collection(firestore, "purchases"), { ...data, purchaseDate: Timestamp.fromDate(new Date(p.purchaseDate)), createdAt: Timestamp.fromDate(new Date(p.createdAt)) });
  return ref.id;
};

const saveReturnToFirebase = async (r: PurchaseReturn): Promise<string> => {
  const { localId, syncStatus, id, purchaseLocalId, productLocalId, ...data } = r;
  if (id) {
    await updateDoc(doc(firestore, "purchaseReturns", id), { ...data });
    return id;
  }
  const ref = await addDoc(collection(firestore, "purchaseReturns"), { ...data, returnDate: Timestamp.fromDate(new Date(r.returnDate)), createdAt: Timestamp.fromDate(new Date(r.createdAt)) });
  return ref.id;
};

// Background sync helper
const syncPurchaseInBackground = async (purchase: Purchase) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    purchase.id = await savePurchaseToFirebase(purchase);
    purchase.syncStatus = "synced";
    await db.put("purchases", purchase);
  } catch (e) { console.warn("Background purchase sync failed:", e); }
};

export const addPurchase = async (data: {
  supplierLocalId: string; supplierName: string; supplierId: string;
  items: PurchaseItem[]; totalAmount: number; paidAmount: number;
  paymentStatus: "paid" | "partial" | "pending"; purchaseDate: string;
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const purchase: Purchase = { ...data, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("purchases", purchase);

  // Then sync to Firebase in background (non-blocking)
  syncPurchaseInBackground({ ...purchase }).catch(console.warn);

  // Update stock and add IMEI records for each item
  for (const item of data.items) {
    await updateStock(item.productLocalId, item.quantity);
    if (item.imeiNumbers.length > 0) {
      const product = await getProductByLocalId(item.productLocalId);
      for (const imei of item.imeiNumbers) {
        await addIMEI({ productLocalId: item.productLocalId, productId: product?.id || "", imei, purchaseLocalId: localId });
      }
    }
  }

  // Add supplier ledger entry (IDB first, Firebase background)
  try {
    const supplierLedgerDB = await openDB("supplier-management", 1);
    const ledgerLocalId = generateLocalId();
    const ledgerEntry = {
      id: "", localId: ledgerLocalId,
      supplierId: data.supplierId, supplierLocalId: data.supplierLocalId,
      date: data.purchaseDate, type: "purchase",
      description: `Purchase - ${data.items.map(i => i.productName).join(", ")}`,
      amount: data.totalAmount, createdAt: new Date().toISOString(), syncStatus: "pending" as const,
    };

    // Save ledger to IndexedDB FIRST (instant)
    await supplierLedgerDB.put("supplierLedger", ledgerEntry);

    // Then sync ledger to Firebase in background (non-blocking)
    if (isOnline() && data.supplierId) {
      (async () => {
        try {
          const ref = await addDoc(collection(firestore, "supplierLedger"), {
            supplierId: data.supplierId, date: Timestamp.fromDate(new Date(data.purchaseDate)),
            type: "purchase", description: ledgerEntry.description, amount: data.totalAmount,
            createdAt: Timestamp.now(),
          });
          ledgerEntry.id = ref.id;
          (ledgerEntry as any).syncStatus = "synced";
          await supplierLedgerDB.put("supplierLedger", ledgerEntry);
        } catch (e) { console.warn("Background ledger sync failed:", e); }
      })();
    }

    // If paid amount > 0, also add a payment ledger entry
    if (data.paidAmount > 0) {
      const payLedgerLocalId = generateLocalId();
      const payLedgerEntry = {
        id: "", localId: payLedgerLocalId,
        supplierId: data.supplierId, supplierLocalId: data.supplierLocalId,
        date: data.purchaseDate, type: "payment" as const,
        description: `Payment on purchase - ${data.items.map(i => i.productName).join(", ")}`,
        amount: data.paidAmount, createdAt: new Date().toISOString(), syncStatus: "pending" as const,
      };

      // Save payment ledger to IndexedDB FIRST (instant)
      await supplierLedgerDB.put("supplierLedger", payLedgerEntry);

      // Then sync to Firebase in background (non-blocking)
      if (isOnline() && data.supplierId) {
        (async () => {
          try {
            const ref2 = await addDoc(collection(firestore, "supplierLedger"), {
              supplierId: data.supplierId, date: Timestamp.fromDate(new Date(data.purchaseDate)),
              type: "payment", description: payLedgerEntry.description, amount: data.paidAmount,
              createdAt: Timestamp.now(),
            });
            payLedgerEntry.id = ref2.id;
            (payLedgerEntry as any).syncStatus = "synced";
            await supplierLedgerDB.put("supplierLedger", payLedgerEntry);
          } catch (e) { console.warn("Background payment ledger sync failed:", e); }
        })();
      }
    }
  } catch (e) { console.warn("Ledger entry failed:", e); }

  return localId;
};

export const addPurchaseReturn = async (data: {
  purchaseLocalId: string; purchaseId: string; productLocalId: string;
  productName: string; returnQuantity: number; returnIMEIs: string[];
  returnReason: string; returnDate: string; returnAmount: number;
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const ret: PurchaseReturn = { ...data, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("purchaseReturns", ret);

  // Then sync to Firebase in background (non-blocking)
  if (isOnline()) {
    (async () => {
      try {
        const db2 = await getDB();
        ret.id = await saveReturnToFirebase(ret);
        ret.syncStatus = "synced";
        await db2.put("purchaseReturns", ret);
      } catch (e) { console.warn("Background return sync failed:", e); }
    })();
  }

  // Decrease stock
  await updateStock(data.productLocalId, -data.returnQuantity);

  return localId;
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "purchases"), orderBy("createdAt", "desc")));
    const existing = await db.getAll("purchases");
    for (const docSnap of snap.docs) {
      if (!existing.find(p => p.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("purchases", {
          id: docSnap.id, localId: generateLocalId(),
          supplierLocalId: d.supplierLocalId || "", supplierName: d.supplierName || "",
          supplierId: d.supplierId || "", items: d.items || [],
          totalAmount: d.totalAmount || 0, paidAmount: d.paidAmount || 0,
          paymentStatus: d.paymentStatus || "pending",
          purchaseDate: d.purchaseDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced" as "pending" | "synced",
        });
      }
    }
  } catch (e) { console.warn("Pull purchases failed:", e); }
};

export const getAllPurchases = async (): Promise<Purchase[]> => {
  const db = await getDB();
  pullFromFirebase().catch(console.warn);
  return (await db.getAll("purchases")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getPurchaseReturns = async (purchaseLocalId: string): Promise<PurchaseReturn[]> => {
  const db = await getDB();
  return db.getAllFromIndex("purchaseReturns", "by-purchase", purchaseLocalId);
};

export const deletePurchase = async (localId: string) => {
  const db = await getDB();
  const purchase = await db.get("purchases", localId);
  if (!purchase) return;

  // Reverse stock first
  for (const item of purchase.items) {
    await updateStock(item.productLocalId, -item.quantity);
  }

  // Delete from IndexedDB FIRST (instant)
  await db.delete("purchases", localId);

  // Then delete from Firebase in background (non-blocking)
  if (purchase.id && isOnline()) {
    deleteDoc(doc(firestore, "purchases", purchase.id)).catch(console.warn);
  }
};

export const syncPurchases = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("purchases", "by-sync", "pending");
  for (const p of pending) {
    try { p.id = await savePurchaseToFirebase(p); p.syncStatus = "synced"; await db.put("purchases", p); } catch (e) { console.error(e); }
  }
  const pendingReturns = await db.getAllFromIndex("purchaseReturns", "by-sync", "pending");
  for (const r of pendingReturns) {
    try { r.id = await saveReturnToFirebase(r); r.syncStatus = "synced"; await db.put("purchaseReturns", r); } catch (e) { console.error(e); }
  }
};

let syncListenerAdded = false;
export const startPurchaseAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncPurchases().catch(console.error); });
  if (isOnline()) syncPurchases().catch(console.error);
};