import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp, where, setDoc,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

// ─── Types ───

export interface Supplier {
  id: string;
  localId: string;
  name: string;
  phone: string;
  address: string;
  cnic: string;
  openingBalance: number;
  balanceType: "payable" | "receivable";
  currentBalance: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface SupplierPayment {
  id: string;
  localId: string;
  supplierId: string;
  supplierLocalId: string;
  amount: number;
  method: "cash" | "bank" | "wallet";
  date: string;
  note: string;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface SupplierLedgerEntry {
  id: string;
  localId: string;
  supplierId: string;
  supplierLocalId: string;
  date: string;
  type: "purchase" | "payment";
  description: string;
  amount: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

// ─── IndexedDB Schema ───

interface SupplierDB extends DBSchema {
  suppliers: { key: string; value: Supplier; indexes: { "by-sync": string } };
  supplierPayments: { key: string; value: SupplierPayment; indexes: { "by-sync": string; "by-supplier": string } };
  supplierLedger: { key: string; value: SupplierLedgerEntry; indexes: { "by-sync": string; "by-supplier": string } };
}

let dbInstance: IDBPDatabase<SupplierDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<SupplierDB>("supplier-management", 1, {
    upgrade(db) {
      const supplierStore = db.createObjectStore("suppliers", { keyPath: "localId" });
      supplierStore.createIndex("by-sync", "syncStatus");

      const paymentStore = db.createObjectStore("supplierPayments", { keyPath: "localId" });
      paymentStore.createIndex("by-sync", "syncStatus");
      paymentStore.createIndex("by-supplier", "supplierLocalId");

      const ledgerStore = db.createObjectStore("supplierLedger", { keyPath: "localId" });
      ledgerStore.createIndex("by-sync", "syncStatus");
      ledgerStore.createIndex("by-supplier", "supplierLocalId");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const isOnline = () => navigator.onLine;

// ─── Supplier CRUD (Offline-first) ───

export const addSupplierOffline = async (data: {
  name: string; phone: string; address: string; cnic: string;
  openingBalance: number; balanceType: "payable" | "receivable";
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const supplier: Supplier = {
    id: "",
    localId,
    ...data,
    currentBalance: data.openingBalance,
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await db.put("suppliers", supplier);

  // Try to sync immediately if online
  if (isOnline()) {
    try { await syncPendingSuppliers(); } catch (e) { console.warn("Sync failed, will retry later", e); }
  }

  return localId;
};

export const updateSupplierOffline = async (localId: string, data: Partial<Supplier>) => {
  const db = await getDB();
  const existing = await db.get("suppliers", localId);
  if (!existing) throw new Error("Supplier not found");
  const updated = { ...existing, ...data, syncStatus: "pending" as const };
  await db.put("suppliers", updated);

  if (isOnline()) {
    try { await syncPendingSuppliers(); } catch (e) { console.warn("Sync failed", e); }
  }
};

export const deleteSupplierOffline = async (localId: string) => {
  const db = await getDB();
  const supplier = await db.get("suppliers", localId);
  if (!supplier) return;

  // Delete from Firebase if synced
  if (supplier.id && isOnline()) {
    try { await deleteDoc(doc(firestore, "suppliers", supplier.id)); } catch (e) { console.warn("Firebase delete failed", e); }
  }

  // Delete locally
  await db.delete("suppliers", localId);

  // Delete related payments and ledger entries
  const payments = await db.getAllFromIndex("supplierPayments", "by-supplier", localId);
  for (const p of payments) await db.delete("supplierPayments", p.localId);

  const ledgerEntries = await db.getAllFromIndex("supplierLedger", "by-supplier", localId);
  for (const l of ledgerEntries) await db.delete("supplierLedger", l.localId);
};

export const getAllSuppliers = async (): Promise<Supplier[]> => {
  const db = await getDB();
  const all = await db.getAll("suppliers");
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// ─── Supplier Payments (Offline-first) ───

export const addSupplierPaymentOffline = async (payment: {
  supplierLocalId: string; amount: number;
  method: "cash" | "bank" | "wallet"; date: string; note: string;
}) => {
  const db = await getDB();
  const supplier = await db.get("suppliers", payment.supplierLocalId);
  if (!supplier) throw new Error("Supplier not found");

  const payLocalId = generateLocalId();
  const ledgerLocalId = generateLocalId();
  const now = new Date().toISOString();

  // Save payment
  await db.put("supplierPayments", {
    id: "", localId: payLocalId,
    supplierId: supplier.id,
    supplierLocalId: payment.supplierLocalId,
    amount: payment.amount,
    method: payment.method,
    date: payment.date,
    note: payment.note,
    createdAt: now,
    syncStatus: "pending",
  });

  // Save ledger entry
  await db.put("supplierLedger", {
    id: "", localId: ledgerLocalId,
    supplierId: supplier.id,
    supplierLocalId: payment.supplierLocalId,
    date: payment.date,
    type: "payment",
    description: `Payment via ${payment.method}${payment.note ? " - " + payment.note : ""}`,
    amount: payment.amount,
    createdAt: now,
    syncStatus: "pending",
  });

  // Recalculate balance locally
  await recalculateBalanceLocal(payment.supplierLocalId);

  // Try sync
  if (isOnline()) {
    try { await syncAll(); } catch (e) { console.warn("Sync failed", e); }
  }

  return payLocalId;
};

// ─── Ledger ───

export const getSupplierLedger = async (supplierLocalId: string): Promise<SupplierLedgerEntry[]> => {
  const db = await getDB();
  const entries = await db.getAllFromIndex("supplierLedger", "by-supplier", supplierLocalId);
  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// ─── Balance Calculation (Local) ───

export const recalculateBalanceLocal = async (supplierLocalId: string) => {
  const db = await getDB();
  const supplier = await db.get("suppliers", supplierLocalId);
  if (!supplier) return;

  const ledgerEntries = await db.getAllFromIndex("supplierLedger", "by-supplier", supplierLocalId);
  let balance = supplier.openingBalance;
  for (const entry of ledgerEntries) {
    if (entry.type === "purchase") balance += entry.amount;
    else if (entry.type === "payment") balance -= entry.amount;
  }

  const balanceType = balance >= 0 ? "payable" : "receivable";
  await db.put("suppliers", {
    ...supplier,
    currentBalance: Math.abs(balance),
    balanceType: balanceType as "payable" | "receivable",
    syncStatus: "pending",
  });
};

// ─── Sync Engine ───

const syncPendingSuppliers = async () => {
  const db = await getDB();
  const pending = await db.getAllFromIndex("suppliers", "by-sync", "pending");

  for (const supplier of pending) {
    try {
      const { localId, syncStatus, ...firebaseData } = supplier;
      if (supplier.id) {
        // Update existing
        await updateDoc(doc(firestore, "suppliers", supplier.id), {
          ...firebaseData,
          createdAt: Timestamp.fromDate(new Date(supplier.createdAt)),
        });
      } else {
        // Create new
        const docRef = await addDoc(collection(firestore, "suppliers"), {
          ...firebaseData,
          id: undefined,
          createdAt: Timestamp.fromDate(new Date(supplier.createdAt)),
        });
        supplier.id = docRef.id;
      }
      supplier.syncStatus = "synced";
      await db.put("suppliers", supplier);
    } catch (e) {
      console.error("Failed to sync supplier:", supplier.localId, e);
    }
  }
};

const syncPendingPayments = async () => {
  const db = await getDB();
  const pending = await db.getAllFromIndex("supplierPayments", "by-sync", "pending");

  for (const payment of pending) {
    try {
      // Resolve supplier Firebase ID
      const supplier = await db.get("suppliers", payment.supplierLocalId);
      if (!supplier?.id) continue; // supplier not synced yet

      const { localId, syncStatus, supplierLocalId, ...firebaseData } = payment;
      if (!payment.id) {
        const docRef = await addDoc(collection(firestore, "supplierPayments"), {
          ...firebaseData,
          supplierId: supplier.id,
          date: Timestamp.fromDate(new Date(payment.date)),
          createdAt: Timestamp.fromDate(new Date(payment.createdAt)),
        });
        payment.id = docRef.id;
      }
      payment.supplierId = supplier.id;
      payment.syncStatus = "synced";
      await db.put("supplierPayments", payment);
    } catch (e) {
      console.error("Failed to sync payment:", payment.localId, e);
    }
  }
};

const syncPendingLedger = async () => {
  const db = await getDB();
  const pending = await db.getAllFromIndex("supplierLedger", "by-sync", "pending");

  for (const entry of pending) {
    try {
      const supplier = await db.get("suppliers", entry.supplierLocalId);
      if (!supplier?.id) continue;

      const { localId, syncStatus, supplierLocalId, ...firebaseData } = entry;
      if (!entry.id) {
        const docRef = await addDoc(collection(firestore, "supplierLedger"), {
          ...firebaseData,
          supplierId: supplier.id,
          date: Timestamp.fromDate(new Date(entry.date)),
          createdAt: Timestamp.fromDate(new Date(entry.createdAt)),
        });
        entry.id = docRef.id;
      }
      entry.supplierId = supplier.id;
      entry.syncStatus = "synced";
      await db.put("supplierLedger", entry);
    } catch (e) {
      console.error("Failed to sync ledger entry:", entry.localId, e);
    }
  }
};

export const syncAll = async () => {
  if (!isOnline()) return;
  await syncPendingSuppliers();
  await syncPendingPayments();
  await syncPendingLedger();
};

export const getPendingCount = async (): Promise<number> => {
  const db = await getDB();
  const s = await db.getAllFromIndex("suppliers", "by-sync", "pending");
  const p = await db.getAllFromIndex("supplierPayments", "by-sync", "pending");
  const l = await db.getAllFromIndex("supplierLedger", "by-sync", "pending");
  return s.length + p.length + l.length;
};

// ─── Auto-sync on reconnect ───

let syncListenerAdded = false;
export const startAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;

  window.addEventListener("online", () => {
    console.log("🟢 Back online — syncing pending data...");
    syncAll().then(() => console.log("✅ Sync complete")).catch(console.error);
  });

  // Initial sync if online
  if (isOnline()) {
    syncAll().catch(console.error);
  }
};
