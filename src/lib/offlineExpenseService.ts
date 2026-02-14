import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

export interface Expense {
  id: string;
  localId: string;
  title: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface ExpenseDB extends DBSchema {
  expenses: { key: string; value: Expense; indexes: { "by-sync": string } };
}

let dbInstance: IDBPDatabase<ExpenseDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<ExpenseDB>("expense-management", 1, {
    upgrade(db) {
      const s = db.createObjectStore("expenses", { keyPath: "localId" });
      s.createIndex("by-sync", "syncStatus");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isOnline = () => navigator.onLine;

const saveToFirebase = async (e: Expense): Promise<string> => {
  const { localId, syncStatus, id, ...data } = e;
  if (id) {
    await updateDoc(doc(firestore, "expenses", id), { ...data, date: Timestamp.fromDate(new Date(e.date)), createdAt: Timestamp.fromDate(new Date(e.createdAt)) });
    return id;
  }
  const ref = await addDoc(collection(firestore, "expenses"), { ...data, date: Timestamp.fromDate(new Date(e.date)), createdAt: Timestamp.fromDate(new Date(e.createdAt)) });
  return ref.id;
};

// Background sync helper
const syncExpenseInBackground = async (expense: Expense) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    expense.id = await saveToFirebase(expense);
    expense.syncStatus = "synced";
    await db.put("expenses", expense);
  } catch (e) { console.warn("Background expense sync failed:", e); }
};

export const addExpense = async (data: { title: string; description: string; amount: number; date: string }) => {
  const db = await getDB();
  const localId = generateLocalId();
  const expense: Expense = { ...data, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("expenses", expense);

  // Then sync to Firebase in background (non-blocking)
  syncExpenseInBackground({ ...expense }).catch(console.warn);

  return localId;
};

export const updateExpense = async (localId: string, data: Partial<Expense>) => {
  const db = await getDB();
  const existing = await db.get("expenses", localId);
  if (!existing) throw new Error("Expense not found");
  const updated: Expense = { ...existing, ...data, syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("expenses", updated);

  // Then sync to Firebase in background (non-blocking)
  syncExpenseInBackground({ ...updated }).catch(console.warn);
};

export const deleteExpense = async (localId: string) => {
  const db = await getDB();
  const e = await db.get("expenses", localId);
  if (!e) return;

  // Delete from IndexedDB FIRST (instant)
  await db.delete("expenses", localId);

  // Then delete from Firebase in background (non-blocking)
  if (e.id && isOnline()) {
    deleteDoc(doc(firestore, "expenses", e.id)).catch(console.warn);
  }
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "expenses"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("expenses");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("expenses", local.localId);
      }
    }

    // Add new records from Firebase
    const remainingLocal = await db.getAll("expenses");
    for (const docSnap of snap.docs) {
      if (!remainingLocal.find(e => e.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("expenses", {
          id: docSnap.id, localId: generateLocalId(),
          title: d.title || "", description: d.description || "", amount: d.amount || 0,
          date: d.date?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced",
        });
      }
    }
  } catch (e) { console.warn("Pull expenses failed:", e); }
};

export const getAllExpenses = async (): Promise<Expense[]> => {
  const db = await getDB();
  pullFromFirebase().catch(console.warn);
  return (await db.getAll("expenses")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const syncExpenses = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("expenses", "by-sync", "pending");
  for (const e of pending) {
    try { e.id = await saveToFirebase(e); e.syncStatus = "synced"; await db.put("expenses", e); } catch (err) { console.error(err); }
  }
};

let syncListenerAdded = false;
export const startExpenseAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncExpenses().catch(console.error); });
  if (isOnline()) syncExpenses().catch(console.error);
};