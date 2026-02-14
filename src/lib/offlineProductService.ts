import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

export interface ProductVariation {
  storage: string;
  color: string;
  costPrice: number;
  salePrice: number;
}

export interface Product {
  id: string;
  localId: string;
  productName: string;
  categoryId: string;       // localId of category
  categoryName: string;
  costPrice: number;
  salePrice: number;
  currentStock: number;
  stockAlertQty: number;
  // Mobile-specific fields
  isMobile: boolean;
  brand: string;
  model: string;
  storage: string;
  color: string;
  imeiTracking: boolean;
  variations: ProductVariation[];
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface IMEIRecord {
  id: string;
  localId: string;
  productLocalId: string;
  productId: string;
  imei: string;
  status: "in_stock" | "sold" | "returned";
  purchaseLocalId: string;
  saleLocalId: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface ProductDB extends DBSchema {
  products: { key: string; value: Product; indexes: { "by-sync": string; "by-category": string } };
  imeiRecords: { key: string; value: IMEIRecord; indexes: { "by-sync": string; "by-product": string; "by-imei": string } };
}

let dbInstance: IDBPDatabase<ProductDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<ProductDB>("product-management", 1, {
    upgrade(db) {
      const ps = db.createObjectStore("products", { keyPath: "localId" });
      ps.createIndex("by-sync", "syncStatus");
      ps.createIndex("by-category", "categoryId");

      const is = db.createObjectStore("imeiRecords", { keyPath: "localId" });
      is.createIndex("by-sync", "syncStatus");
      is.createIndex("by-product", "productLocalId");
      is.createIndex("by-imei", "imei");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isOnline = () => navigator.onLine;

const saveProductToFirebase = async (p: Product): Promise<string> => {
  const { localId, syncStatus, id, ...data } = p;
  if (id) {
    await updateDoc(doc(firestore, "products", id), { ...data, createdAt: Timestamp.fromDate(new Date(p.createdAt)) });
    return id;
  }
  const ref = await addDoc(collection(firestore, "products"), { ...data, createdAt: Timestamp.fromDate(new Date(p.createdAt)) });
  return ref.id;
};

const saveIMEIToFirebase = async (r: IMEIRecord): Promise<string> => {
  const { localId, syncStatus, id, productLocalId, purchaseLocalId, saleLocalId, ...data } = r;
  if (id) {
    await updateDoc(doc(firestore, "imeiRecords", id), { ...data });
    return id;
  }
  const ref = await addDoc(collection(firestore, "imeiRecords"), { ...data, createdAt: Timestamp.fromDate(new Date(r.createdAt)) });
  return ref.id;
};

export const addProduct = async (data: Omit<Product, "id" | "localId" | "createdAt" | "syncStatus">) => {
  const db = await getDB();
  const localId = generateLocalId();
  const product: Product = { ...data, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  if (isOnline()) {
    try { product.id = await saveProductToFirebase(product); product.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("products", product);
  return localId;
};

export const updateProduct = async (localId: string, data: Partial<Product>) => {
  const db = await getDB();
  const existing = await db.get("products", localId);
  if (!existing) throw new Error("Product not found");
  const updated: Product = { ...existing, ...data, syncStatus: "pending" };
  if (isOnline()) {
    try { await saveProductToFirebase(updated); updated.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("products", updated);
};

export const deleteProduct = async (localId: string) => {
  const db = await getDB();
  const p = await db.get("products", localId);
  if (!p) return;
  if (p.id && isOnline()) { try { await deleteDoc(doc(firestore, "products", p.id)); } catch (e) { console.warn(e); } }
  await db.delete("products", localId);
  // Delete associated IMEIs
  const imeis = await db.getAllFromIndex("imeiRecords", "by-product", localId);
  for (const i of imeis) await db.delete("imeiRecords", i.localId);
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "products"), orderBy("createdAt", "desc")));
    const existing = await db.getAll("products");
    for (const docSnap of snap.docs) {
      if (!existing.find(p => p.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("products", {
          id: docSnap.id, localId: generateLocalId(),
          productName: d.productName || "", categoryId: d.categoryId || "", categoryName: d.categoryName || "",
          costPrice: d.costPrice || 0, salePrice: d.salePrice || 0,
          currentStock: d.currentStock || 0, stockAlertQty: d.stockAlertQty || 0,
          isMobile: d.isMobile || false, brand: d.brand || "", model: d.model || "",
          storage: d.storage || "", color: d.color || "", imeiTracking: d.imeiTracking || false,
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced",
          variations: d.variations || [],
        });
      }
    }
  } catch (e) { console.warn("Pull products failed:", e); }
};

export const getAllProducts = async (): Promise<Product[]> => {
  const db = await getDB();
  // Load from local DB instantly, sync Firebase in background
  pullFromFirebase().catch(console.warn);
  return (await db.getAll("products")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getProductByLocalId = async (localId: string): Promise<Product | undefined> => {
  const db = await getDB();
  return db.get("products", localId);
};

export const updateStock = async (localId: string, quantityChange: number) => {
  const db = await getDB();
  const p = await db.get("products", localId);
  if (!p) return;
  p.currentStock += quantityChange;
  p.syncStatus = "pending";
  if (isOnline()) {
    try { await saveProductToFirebase(p); p.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("products", p);
};

// IMEI
export const addIMEI = async (data: { productLocalId: string; productId: string; imei: string; purchaseLocalId: string }) => {
  const db = await getDB();
  const localId = generateLocalId();
  const record: IMEIRecord = {
    id: "", localId, ...data, status: "in_stock", saleLocalId: "", createdAt: new Date().toISOString(), syncStatus: "pending",
  };
  if (isOnline()) {
    try { record.id = await saveIMEIToFirebase(record); record.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("imeiRecords", record);
  return localId;
};

export const getIMEIsByProduct = async (productLocalId: string): Promise<IMEIRecord[]> => {
  const db = await getDB();
  return db.getAllFromIndex("imeiRecords", "by-product", productLocalId);
};

export const checkIMEIExists = async (imei: string): Promise<boolean> => {
  const db = await getDB();
  const records = await db.getAllFromIndex("imeiRecords", "by-imei", imei);
  return records.some(r => r.status === "in_stock");
};

export const searchIMEIByPartial = async (partial: string): Promise<(IMEIRecord & { product?: Product })[]> => {
  const db = await getDB();
  const allIMEIs = await db.getAll("imeiRecords");
  const lowerPartial = partial.toLowerCase();
  const matches = allIMEIs.filter(r => r.status === "in_stock" && 
    (r.imei.endsWith(partial) || r.imei.includes(lowerPartial) || r.imei.toLowerCase().includes(lowerPartial)));
  const results: (IMEIRecord & { product?: Product })[] = [];
  for (const r of matches) {
    const product = await db.get("products", r.productLocalId);
    results.push({ ...r, product });
  }
  return results;
};

export const syncProducts = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("products", "by-sync", "pending");
  for (const p of pending) {
    try { p.id = await saveProductToFirebase(p); p.syncStatus = "synced"; await db.put("products", p); } catch (e) { console.error(e); }
  }
  const pendingIMEI = await db.getAllFromIndex("imeiRecords", "by-sync", "pending");
  for (const r of pendingIMEI) {
    try { r.id = await saveIMEIToFirebase(r); r.syncStatus = "synced"; await db.put("imeiRecords", r); } catch (e) { console.error(e); }
  }
};

let syncListenerAdded = false;
export const startProductAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncProducts().catch(console.error); });
  if (isOnline()) syncProducts().catch(console.error);
};
