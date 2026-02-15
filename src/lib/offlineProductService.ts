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
  categoryId: string;
  categoryName: string;
  costPrice: number;
  salePrice: number;
  currentStock: number;
  stockAlertQty: number;
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

// Background sync helper - saves to IDB first, then syncs Firebase without blocking
const syncProductInBackground = async (product: Product) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    product.id = await saveProductToFirebase(product);
    product.syncStatus = "synced";
    await db.put("products", product);
  } catch (e) { console.warn("Background product sync failed:", e); }
};

const syncIMEIInBackground = async (record: IMEIRecord) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    record.id = await saveIMEIToFirebase(record);
    record.syncStatus = "synced";
    await db.put("imeiRecords", record);
  } catch (e) { console.warn("Background IMEI sync failed:", e); }
};

export const addProduct = async (data: Omit<Product, "id" | "localId" | "createdAt" | "syncStatus">) => {
  const db = await getDB();
  const localId = generateLocalId();
  const product: Product = { ...data, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("products", product);

  // Then sync to Firebase in background (non-blocking)
  syncProductInBackground({ ...product }).catch(console.warn);

  return localId;
};

export const updateProduct = async (localId: string, data: Partial<Product>) => {
  const db = await getDB();
  const existing = await db.get("products", localId);
  if (!existing) throw new Error("Product not found");
  const updated: Product = { ...existing, ...data, syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("products", updated);

  // Then sync to Firebase in background (non-blocking)
  syncProductInBackground({ ...updated }).catch(console.warn);
};

export const deleteProduct = async (localId: string) => {
  const db = await getDB();
  const p = await db.get("products", localId);
  if (!p) return;

  // Delete from IndexedDB FIRST (instant)
  await db.delete("products", localId);
  const imeis = await db.getAllFromIndex("imeiRecords", "by-product", localId);
  for (const i of imeis) await db.delete("imeiRecords", i.localId);

  // Then delete from Firebase in background (non-blocking)
  if (p.id && isOnline()) {
    deleteDoc(doc(firestore, "products", p.id)).catch(console.warn);
  }
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "products"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("products");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("products", local.localId);
        // Also clean up related IMEI records
        const imeis = await db.getAllFromIndex("imeiRecords", "by-product", local.localId);
        for (const i of imeis) await db.delete("imeiRecords", i.localId);
      }
    }

    // Add new records from Firebase (skip if pending records exist to avoid duplicates)
    const remainingLocal = await db.getAll("products");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of snap.docs) {
      if (!hasPending && !remainingLocal.find(p => p.id === docSnap.id)) {
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
  pullFromFirebase().catch(console.warn);
  const all = (await db.getAll("products")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // Deduplicate by product name (keep the one with id or latest)
  const seen = new Map<string, Product>();
  for (const p of all) {
    const key = p.productName.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else {
      // Merge: keep the one with firebase id, combine stock
      if (p.id && !existing.id) {
        p.currentStock = Math.max(p.currentStock, existing.currentStock);
        seen.set(key, p);
      } else if (!p.id && existing.id) {
        existing.currentStock = Math.max(existing.currentStock, p.currentStock);
      }
      // If both have ids or both don't, keep existing (first one)
    }
  }
  return Array.from(seen.values());
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

  // Save to IndexedDB FIRST (instant)
  await db.put("products", p);

  // Then sync to Firebase in background (non-blocking)
  syncProductInBackground({ ...p }).catch(console.warn);
};

// IMEI
export const addIMEI = async (data: { productLocalId: string; productId: string; imei: string; purchaseLocalId: string }) => {
  const db = await getDB();
  const localId = generateLocalId();
  const record: IMEIRecord = {
    id: "", localId, ...data, status: "in_stock", saleLocalId: "", createdAt: new Date().toISOString(), syncStatus: "pending",
  };

  // Save to IndexedDB FIRST (instant)
  await db.put("imeiRecords", record);

  // Then sync to Firebase in background (non-blocking)
  syncIMEIInBackground({ ...record }).catch(console.warn);

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