import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

export interface Category {
  id: string;
  localId: string;
  categoryName: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface CategoryDB extends DBSchema {
  categories: { key: string; value: Category; indexes: { "by-sync": string } };
}

let dbInstance: IDBPDatabase<CategoryDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<CategoryDB>("category-management", 1, {
    upgrade(db) {
      const store = db.createObjectStore("categories", { keyPath: "localId" });
      store.createIndex("by-sync", "syncStatus");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isOnline = () => navigator.onLine;

const saveCategoryToFirebase = async (cat: Category): Promise<string> => {
  const { localId, syncStatus, id, ...data } = cat;
  if (id) {
    await updateDoc(doc(firestore, "categories", id), {
      ...data, createdAt: Timestamp.fromDate(new Date(cat.createdAt)),
    });
    return id;
  }
  const docRef = await addDoc(collection(firestore, "categories"), {
    ...data, createdAt: Timestamp.fromDate(new Date(cat.createdAt)),
  });
  return docRef.id;
};

// Background sync helper
const syncCategoryInBackground = async (cat: Category) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    cat.id = await saveCategoryToFirebase(cat);
    cat.syncStatus = "synced";
    await db.put("categories", cat);
  } catch (e) { console.warn("Background category sync failed:", e); }
};

export const addCategory = async (categoryName: string) => {
  const db = await getDB();
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const cat: Category = { id: "", localId, categoryName, createdAt: now, syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("categories", cat);

  // Then sync to Firebase in background (non-blocking)
  syncCategoryInBackground({ ...cat }).catch(console.warn);

  return localId;
};

export const updateCategory = async (localId: string, categoryName: string) => {
  const db = await getDB();
  const existing = await db.get("categories", localId);
  if (!existing) throw new Error("Category not found");
  const updated: Category = { ...existing, categoryName, syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("categories", updated);

  // Then sync to Firebase in background (non-blocking)
  syncCategoryInBackground({ ...updated }).catch(console.warn);
};

export const deleteCategory = async (localId: string) => {
  const db = await getDB();
  const cat = await db.get("categories", localId);
  if (!cat) return;

  // Delete from IndexedDB FIRST (instant)
  await db.delete("categories", localId);

  // Then delete from Firebase in background (non-blocking)
  if (cat.id && isOnline()) {
    deleteDoc(doc(firestore, "categories", cat.id)).catch(console.warn);
  }
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "categories"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("categories");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("categories", local.localId);
      }
    }

    // Add new records from Firebase (skip if pending records exist to avoid duplicates)
    const remainingLocal = await db.getAll("categories");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of snap.docs) {
      if (!hasPending && !remainingLocal.find(c => c.id === docSnap.id)) {
        const data = docSnap.data();
        await db.put("categories", {
          id: docSnap.id, localId: generateLocalId(),
          categoryName: data.categoryName || "",
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced",
        });
      }
    }
  } catch (e) { console.warn("Pull categories failed:", e); }
};

export const getAllCategories = async (): Promise<Category[]> => {
  const db = await getDB();
  pullFromFirebase().catch(console.warn);
  const all = await db.getAll("categories");
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const syncCategories = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("categories", "by-sync", "pending");
  for (const cat of pending) {
    try {
      cat.id = await saveCategoryToFirebase(cat);
      cat.syncStatus = "synced";
      await db.put("categories", cat);
    } catch (e) { console.error("Sync category failed:", e); }
  }
};

let syncListenerAdded = false;
export const startCategoryAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncCategories().catch(console.error); });
  if (isOnline()) syncCategories().catch(console.error);
};