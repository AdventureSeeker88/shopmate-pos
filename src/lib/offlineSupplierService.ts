import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp, setDoc,
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

// ─── Firebase Direct Save Helpers ───

const saveSupplierToFirebase = async (supplier: Supplier): Promise<string> => {
  const { localId, syncStatus, id, ...data } = supplier;
  if (id) {
    await updateDoc(doc(firestore, "suppliers", id), {
      ...data,
      createdAt: Timestamp.fromDate(new Date(supplier.createdAt)),
    });
    return id;
  } else {
    const docRef = await addDoc(collection(firestore, "suppliers"), {
      ...data,
      createdAt: Timestamp.fromDate(new Date(supplier.createdAt)),
    });
    return docRef.id;
  }
};

const savePaymentToFirebase = async (payment: SupplierPayment, firebaseSupplierId: string): Promise<string> => {
  const { localId, syncStatus, supplierLocalId, id, ...data } = payment;
  const docRef = await addDoc(collection(firestore, "supplierPayments"), {
    ...data,
    supplierId: firebaseSupplierId,
    date: Timestamp.fromDate(new Date(payment.date)),
    createdAt: Timestamp.fromDate(new Date(payment.createdAt)),
  });
  return docRef.id;
};

const saveLedgerToFirebase = async (entry: SupplierLedgerEntry, firebaseSupplierId: string): Promise<string> => {
  const { localId, syncStatus, supplierLocalId, id, ...data } = entry;
  const docRef = await addDoc(collection(firestore, "supplierLedger"), {
    ...data,
    supplierId: firebaseSupplierId,
    date: Timestamp.fromDate(new Date(entry.date)),
    createdAt: Timestamp.fromDate(new Date(entry.createdAt)),
  });
  return docRef.id;
};

// ─── Supplier CRUD (Online-first, Offline-fallback) ───

export const addSupplierOffline = async (data: {
  name: string; phone: string; address: string; cnic: string;
  openingBalance: number; balanceType: "payable" | "receivable";
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const now = new Date().toISOString();

  const supplier: Supplier = {
    id: "",
    localId,
    ...data,
    currentBalance: data.openingBalance,
    createdAt: now,
    syncStatus: "pending",
  };

  if (isOnline()) {
    try {
      const firebaseId = await saveSupplierToFirebase(supplier);
      supplier.id = firebaseId;
      supplier.syncStatus = "synced";
      console.log("✅ Supplier saved directly to Firebase:", firebaseId);
    } catch (e) {
      console.warn("⚠️ Firebase save failed, storing offline:", e);
    }
  }

  await db.put("suppliers", supplier);
  return localId;
};

export const updateSupplierOffline = async (localId: string, data: Partial<Supplier>) => {
  const db = await getDB();
  const existing = await db.get("suppliers", localId);
  if (!existing) throw new Error("Supplier not found");

  const updated: Supplier = { ...existing, ...data, syncStatus: "pending" };

  if (isOnline()) {
    try {
      await saveSupplierToFirebase(updated);
      updated.syncStatus = "synced";
      console.log("✅ Supplier updated directly on Firebase");
    } catch (e) {
      console.warn("⚠️ Firebase update failed, stored offline:", e);
    }
  }

  await db.put("suppliers", updated);
};

export const deleteSupplierOffline = async (localId: string) => {
  const db = await getDB();
  const supplier = await db.get("suppliers", localId);
  if (!supplier) return;

  if (supplier.id && isOnline()) {
    try { await deleteDoc(doc(firestore, "suppliers", supplier.id)); } catch (e) { console.warn("Firebase delete failed", e); }
  }

  await db.delete("suppliers", localId);

  const payments = await db.getAllFromIndex("supplierPayments", "by-supplier", localId);
  for (const p of payments) await db.delete("supplierPayments", p.localId);

  const ledgerEntries = await db.getAllFromIndex("supplierLedger", "by-supplier", localId);
  for (const l of ledgerEntries) await db.delete("supplierLedger", l.localId);
};

export const pullSuppliersFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "suppliers"), orderBy("createdAt", "desc")));
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const existing = await db.getAll("suppliers");
      const match = existing.find((s) => s.id === docSnap.id);
      if (!match) {
        const localId = generateLocalId();
        const supplier: Supplier = {
          id: docSnap.id,
          localId,
          name: data.name || "",
          phone: data.phone || "",
          address: data.address || "",
          cnic: data.cnic || "",
          openingBalance: data.openingBalance || 0,
          balanceType: data.balanceType || "payable",
          currentBalance: data.currentBalance || 0,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced",
        };
        await db.put("suppliers", supplier);
        console.log("📥 Pulled supplier from Firebase:", supplier.name);
      }
    }
  } catch (e) {
    console.warn("⚠️ Failed to pull suppliers from Firebase:", e);
  }
};

export const getAllSuppliers = async (): Promise<Supplier[]> => {
  const db = await getDB();
  // Load from local DB instantly, sync Firebase in background
  pullSuppliersFromFirebase().catch(console.warn);
  const all = await db.getAll("suppliers");
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// ─── Supplier Payments (Online-first) ───

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

  const paymentRecord: SupplierPayment = {
    id: "", localId: payLocalId,
    supplierId: supplier.id,
    supplierLocalId: payment.supplierLocalId,
    amount: payment.amount,
    method: payment.method,
    date: payment.date,
    note: payment.note,
    createdAt: now,
    syncStatus: "pending",
  };

  const ledgerRecord: SupplierLedgerEntry = {
    id: "", localId: ledgerLocalId,
    supplierId: supplier.id,
    supplierLocalId: payment.supplierLocalId,
    date: payment.date,
    type: "payment",
    description: `Payment via ${payment.method}${payment.note ? " - " + payment.note : ""}`,
    amount: payment.amount,
    createdAt: now,
    syncStatus: "pending",
  };

  // If online and supplier is synced, save directly to Firebase
  if (isOnline() && supplier.id) {
    try {
      const payId = await savePaymentToFirebase(paymentRecord, supplier.id);
      paymentRecord.id = payId;
      (paymentRecord as any).syncStatus = "synced";

      const ledgerId = await saveLedgerToFirebase(ledgerRecord, supplier.id);
      ledgerRecord.id = ledgerId;
      (ledgerRecord as any).syncStatus = "synced";

      console.log("✅ Payment & ledger saved directly to Firebase");
    } catch (e) {
      console.warn("⚠️ Firebase payment save failed, storing offline:", e);
    }
  }

  await db.put("supplierPayments", paymentRecord);
  await db.put("supplierLedger", ledgerRecord);

  // Recalculate balance locally
  await recalculateBalanceLocal(payment.supplierLocalId);

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
  const updated: Supplier = {
    ...supplier,
    currentBalance: Math.abs(balance),
    balanceType: balanceType as "payable" | "receivable",
    syncStatus: "pending",
  };

  // Sync updated balance to Firebase if online
  if (isOnline() && updated.id) {
    try {
      await saveSupplierToFirebase(updated);
      updated.syncStatus = "synced";
    } catch (e) {
      console.warn("Balance sync failed:", e);
    }
  }

  await db.put("suppliers", updated);
};

// ─── Sync Engine (for offline pending records) ───

const syncPendingSuppliers = async () => {
  const db = await getDB();
  const pending = await db.getAllFromIndex("suppliers", "by-sync", "pending");

  for (const supplier of pending) {
    try {
      const firebaseId = await saveSupplierToFirebase(supplier);
      supplier.id = firebaseId || supplier.id;
      supplier.syncStatus = "synced";
      await db.put("suppliers", supplier);
      console.log("✅ Synced pending supplier:", supplier.name);
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
      const supplier = await db.get("suppliers", payment.supplierLocalId);
      if (!supplier?.id) continue;

      const payId = await savePaymentToFirebase(payment, supplier.id);
      payment.id = payId;
      payment.supplierId = supplier.id;
      payment.syncStatus = "synced";
      await db.put("supplierPayments", payment);
      console.log("✅ Synced pending payment:", payment.localId);
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

      const ledgerId = await saveLedgerToFirebase(entry, supplier.id);
      entry.id = ledgerId;
      entry.supplierId = supplier.id;
      entry.syncStatus = "synced";
      await db.put("supplierLedger", entry);
      console.log("✅ Synced pending ledger:", entry.localId);
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
    syncAll().then(() => console.log("✅ Auto-sync complete")).catch(console.error);
  });

  // Initial sync of any pending records
  if (isOnline()) {
    syncAll().then(() => console.log("✅ Initial sync complete")).catch(console.error);
  }
};
