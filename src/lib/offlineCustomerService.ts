import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

export interface Customer {
  id: string;
  localId: string;
  customerId: string;
  name: string;
  phone: string;
  cnic: string;
  address: string;
  openingBalance: number;
  balanceType: "payable" | "receivable";
  currentBalance: number;
  status: "active" | "inactive";
  createdAt: string;
  syncStatus: "pending" | "synced";
}

export interface CustomerLedgerEntry {
  id: string;
  localId: string;
  customerId: string;
  customerLocalId: string;
  date: string;
  type: "sale" | "payment" | "sale_return";
  description: string;
  amount: number;
  createdAt: string;
  syncStatus: "pending" | "synced";
}

interface CustomerDB extends DBSchema {
  customers: { key: string; value: Customer; indexes: { "by-sync": string } };
  customerLedger: { key: string; value: CustomerLedgerEntry; indexes: { "by-sync": string; "by-customer": string } };
}

let dbInstance: IDBPDatabase<CustomerDB> | null = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<CustomerDB>("customer-management", 1, {
    upgrade(db) {
      const cs = db.createObjectStore("customers", { keyPath: "localId" });
      cs.createIndex("by-sync", "syncStatus");
      const ls = db.createObjectStore("customerLedger", { keyPath: "localId" });
      ls.createIndex("by-sync", "syncStatus");
      ls.createIndex("by-customer", "customerLocalId");
    },
  });
  return dbInstance;
};

const generateLocalId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const generateCustomerId = () => `CUST-${String(Date.now()).slice(-6)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const isOnline = () => navigator.onLine;

const saveCustomerToFirebase = async (c: Customer): Promise<string> => {
  const { localId, syncStatus, id, ...data } = c;
  if (id) {
    await updateDoc(doc(firestore, "customers", id), { ...data, createdAt: Timestamp.fromDate(new Date(c.createdAt)) });
    return id;
  }
  const ref = await addDoc(collection(firestore, "customers"), { ...data, createdAt: Timestamp.fromDate(new Date(c.createdAt)) });
  return ref.id;
};

const saveLedgerToFirebase = async (entry: CustomerLedgerEntry, firebaseCustomerId: string): Promise<string> => {
  const { localId, syncStatus, customerLocalId, id, ...data } = entry;
  const ref = await addDoc(collection(firestore, "customerLedger"), {
    ...data, customerId: firebaseCustomerId,
    date: Timestamp.fromDate(new Date(entry.date)),
    createdAt: Timestamp.fromDate(new Date(entry.createdAt)),
  });
  return ref.id;
};

// Background sync helpers
const syncCustomerInBackground = async (customer: Customer) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    customer.id = await saveCustomerToFirebase(customer);
    customer.syncStatus = "synced";
    await db.put("customers", customer);
  } catch (e) { console.warn("Background customer sync failed:", e); }
};

const syncLedgerInBackground = async (entry: CustomerLedgerEntry, firebaseCustomerId: string) => {
  if (!isOnline() || !firebaseCustomerId) return;
  const db = await getDB();
  try {
    entry.id = await saveLedgerToFirebase(entry, firebaseCustomerId);
    entry.syncStatus = "synced";
    await db.put("customerLedger", entry);
  } catch (e) { console.warn("Background ledger sync failed:", e); }
};

// CRUD
export const addCustomer = async (data: {
  name: string; phone: string; cnic: string; address: string;
  openingBalance: number; balanceType: "payable" | "receivable";
  createdAt?: string;
}) => {
  const db = await getDB();
  const localId = generateLocalId();
  const customerId = generateCustomerId();
  const customer: Customer = {
    id: "", localId, customerId, ...data, currentBalance: data.openingBalance,
    status: "active", createdAt: data.createdAt || new Date().toISOString(), syncStatus: "pending",
  };

  // Save to IndexedDB FIRST (instant)
  await db.put("customers", customer);

  // Then sync to Firebase in background (non-blocking)
  syncCustomerInBackground({ ...customer }).catch(console.warn);

  return localId;
};

export const updateCustomer = async (localId: string, data: Partial<Customer>) => {
  const db = await getDB();
  const existing = await db.get("customers", localId);
  if (!existing) throw new Error("Customer not found");
  const updated: Customer = { ...existing, ...data, syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("customers", updated);

  // Then sync to Firebase in background (non-blocking)
  syncCustomerInBackground({ ...updated }).catch(console.warn);
};

export const deleteCustomer = async (localId: string) => {
  const db = await getDB();
  const c = await db.get("customers", localId);
  if (!c) return;

  // Delete from IndexedDB FIRST (instant)
  await db.delete("customers", localId);
  const ledger = await db.getAllFromIndex("customerLedger", "by-customer", localId);
  for (const l of ledger) await db.delete("customerLedger", l.localId);

  // Then delete from Firebase in background (non-blocking)
  if (c.id && isOnline()) {
    deleteDoc(doc(firestore, "customers", c.id)).catch(console.warn);
  }
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "customers"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("customers");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("customers", local.localId);
        // Also clean up related ledger entries
        const ledger = await db.getAllFromIndex("customerLedger", "by-customer", local.localId);
        for (const l of ledger) await db.delete("customerLedger", l.localId);
      }
    }

    // Add new records from Firebase (skip if pending records exist to avoid duplicates)
    const remainingLocal = await db.getAll("customers");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of snap.docs) {
      const alreadyExists = remainingLocal.find(c => c.id === docSnap.id || (c.name === docSnap.data().name && c.phone === docSnap.data().phone));
      if (!hasPending && !alreadyExists) {
        const d = docSnap.data();
        await db.put("customers", {
          id: docSnap.id, localId: generateLocalId(), customerId: d.customerId || generateCustomerId(),
          name: d.name || "", phone: d.phone || "", cnic: d.cnic || "", address: d.address || "",
          openingBalance: d.openingBalance || 0, balanceType: d.balanceType || "payable",
          currentBalance: d.currentBalance || 0, status: d.status || "active",
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced",
        });
      }
    }
  } catch (e) { console.warn("Pull customers failed:", e); }
};

export const getAllCustomers = async (): Promise<Customer[]> => {
  const db = await getDB();
  pullFromFirebase().catch(console.warn);
  return (await db.getAll("customers")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getCustomerByLocalId = async (localId: string): Promise<Customer | undefined> => {
  const db = await getDB();
  return db.get("customers", localId);
};

// Pull customer ledger from Firebase
const pullCustomerLedgerFromFirebase = async (customerLocalId: string) => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const customer = await db.get("customers", customerLocalId);
    if (!customer?.id) return;

    const snap = await getDocs(query(collection(firestore, "customerLedger"), orderBy("createdAt", "desc")));
    const customerDocs = snap.docs.filter(d => d.data().customerId === customer.id);
    const firebaseIds = new Set(customerDocs.map(d => d.id));
    const existing = await db.getAllFromIndex("customerLedger", "by-customer", customerLocalId);

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("customerLedger", local.localId);
      }
    }

    // Add new records from Firebase
    const remainingLocal = await db.getAllFromIndex("customerLedger", "by-customer", customerLocalId);
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    for (const docSnap of customerDocs) {
      if (!hasPending && !remainingLocal.find(l => l.id === docSnap.id)) {
        const d = docSnap.data();
        await db.put("customerLedger", {
          id: docSnap.id, localId: generateLocalId(),
          customerId: d.customerId || "", customerLocalId,
          date: d.date?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          type: d.type || "sale", description: d.description || "",
          amount: d.amount || 0,
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced" as const,
        });
      }
    }
  } catch (e) { console.warn("Pull customer ledger failed:", e); }
};

// Ledger
export const getCustomerLedger = async (customerLocalId: string): Promise<CustomerLedgerEntry[]> => {
  const db = await getDB();
  pullCustomerLedgerFromFirebase(customerLocalId).catch(console.warn);
  return (await db.getAllFromIndex("customerLedger", "by-customer", customerLocalId))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const addCustomerLedgerEntry = async (entry: Omit<CustomerLedgerEntry, "id" | "localId" | "createdAt" | "syncStatus">) => {
  const db = await getDB();
  const localId = generateLocalId();
  const record: CustomerLedgerEntry = { ...entry, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };

  // Save to IndexedDB FIRST (instant)
  await db.put("customerLedger", record);

  // Then sync to Firebase in background (non-blocking)
  if (entry.customerId) {
    syncLedgerInBackground({ ...record }, entry.customerId).catch(console.warn);
  }

  return localId;
};

export const recalculateCustomerBalance = async (customerLocalId: string) => {
  const db = await getDB();
  const customer = await db.get("customers", customerLocalId);
  if (!customer) return;
  const ledger = await db.getAllFromIndex("customerLedger", "by-customer", customerLocalId);
  let balance = customer.openingBalance;
  for (const e of ledger) {
    if (e.type === "sale") balance += e.amount;
    else if (e.type === "payment") balance -= e.amount;
    else if (e.type === "sale_return") balance -= e.amount;
  }
  // Balance is always payable (customer owes shop) - never negative
  const finalBalance = Math.max(0, balance);
  const updated: Customer = {
    ...customer, currentBalance: finalBalance,
    balanceType: "payable", syncStatus: "pending",
  };

  // Save to IndexedDB FIRST (instant)
  await db.put("customers", updated);

  // Then sync to Firebase in background (non-blocking)
  syncCustomerInBackground({ ...updated }).catch(console.warn);
};

// Customer Payment
export const addCustomerPayment = async (payment: {
  customerLocalId: string; amount: number;
  method: "cash" | "bank" | "wallet"; date: string; note: string;
}) => {
  const db = await getDB();
  const customer = await db.get("customers", payment.customerLocalId);
  if (!customer) throw new Error("Customer not found");

  const localId = generateLocalId();
  const entry: CustomerLedgerEntry = {
    id: "", localId, customerId: customer.id,
    customerLocalId: payment.customerLocalId,
    date: payment.date, type: "payment",
    description: `Payment via ${payment.method}${payment.note ? " - " + payment.note : ""}`,
    amount: payment.amount, createdAt: new Date().toISOString(), syncStatus: "pending",
  };

  // Save to IndexedDB FIRST (instant)
  await db.put("customerLedger", entry);

  // Then sync to Firebase in background (non-blocking)
  if (customer.id) {
    syncLedgerInBackground({ ...entry }, customer.id).catch(console.warn);
  }

  await recalculateCustomerBalance(payment.customerLocalId);
  return localId;
};

// Sync
export const syncCustomers = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  const pending = await db.getAllFromIndex("customers", "by-sync", "pending");
  for (const c of pending) {
    try { c.id = await saveCustomerToFirebase(c); c.syncStatus = "synced"; await db.put("customers", c); } catch (e) { console.error(e); }
  }
  const pendingLedger = await db.getAllFromIndex("customerLedger", "by-sync", "pending");
  for (const l of pendingLedger) {
    try {
      const cust = await db.get("customers", l.customerLocalId);
      if (!cust?.id) continue;
      l.id = await saveLedgerToFirebase(l, cust.id);
      l.syncStatus = "synced";
      await db.put("customerLedger", l);
    } catch (e) { console.error(e); }
  }
};

let syncListenerAdded = false;
const pullAllCustomerLedgerFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "customerLedger"), orderBy("createdAt", "desc")));
    const firebaseIds = new Set(snap.docs.map(d => d.id));
    const existing = await db.getAll("customerLedger");

    // Remove local synced records not in Firebase
    for (const local of existing) {
      if (local.syncStatus === "synced" && local.id && !firebaseIds.has(local.id)) {
        await db.delete("customerLedger", local.localId);
      }
    }

    // Add new records from Firebase
    const remainingLocal = await db.getAll("customerLedger");
    const hasPending = remainingLocal.some(r => r.syncStatus === "pending");
    const allCustomers = await db.getAll("customers");

    for (const docSnap of snap.docs) {
      if (!hasPending && !remainingLocal.find(l => l.id === docSnap.id)) {
        const d = docSnap.data();
        // Find matching local customer by firebase ID
        const matchingCustomer = allCustomers.find(c => c.id === d.customerId);
        await db.put("customerLedger", {
          id: docSnap.id, localId: generateLocalId(),
          customerId: d.customerId || "",
          customerLocalId: matchingCustomer?.localId || d.customerLocalId || "",
          date: d.date?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          type: d.type || "sale", description: d.description || "",
          amount: d.amount || 0,
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          syncStatus: "synced" as const,
        });
      }
    }
  } catch (e) { console.warn("Pull all customer ledger failed:", e); }
};

export const getAllCustomerLedgerEntries = async (): Promise<CustomerLedgerEntry[]> => {
  const db = await getDB();
  pullAllCustomerLedgerFromFirebase().catch(console.warn);
  return db.getAll("customerLedger");
};

export const startCustomerAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncCustomers().catch(console.error); });
  if (isOnline()) syncCustomers().catch(console.error);
};