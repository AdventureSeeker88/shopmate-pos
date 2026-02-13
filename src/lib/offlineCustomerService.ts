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
  if (isOnline()) {
    try { customer.id = await saveCustomerToFirebase(customer); customer.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("customers", customer);
  return localId;
};

export const updateCustomer = async (localId: string, data: Partial<Customer>) => {
  const db = await getDB();
  const existing = await db.get("customers", localId);
  if (!existing) throw new Error("Customer not found");
  const updated: Customer = { ...existing, ...data, syncStatus: "pending" };
  if (isOnline()) {
    try { await saveCustomerToFirebase(updated); updated.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("customers", updated);
};

export const deleteCustomer = async (localId: string) => {
  const db = await getDB();
  const c = await db.get("customers", localId);
  if (!c) return;
  if (c.id && isOnline()) { try { await deleteDoc(doc(firestore, "customers", c.id)); } catch (e) { console.warn(e); } }
  await db.delete("customers", localId);
  const ledger = await db.getAllFromIndex("customerLedger", "by-customer", localId);
  for (const l of ledger) await db.delete("customerLedger", l.localId);
};

const pullFromFirebase = async () => {
  if (!isOnline()) return;
  const db = await getDB();
  try {
    const snap = await getDocs(query(collection(firestore, "customers"), orderBy("createdAt", "desc")));
    const existing = await db.getAll("customers");
    for (const docSnap of snap.docs) {
      const alreadyExists = existing.find(c => c.id === docSnap.id || (c.name === docSnap.data().name && c.phone === docSnap.data().phone));
      if (!alreadyExists) {
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
  await pullFromFirebase();
  return (await db.getAll("customers")).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getCustomerByLocalId = async (localId: string): Promise<Customer | undefined> => {
  const db = await getDB();
  return db.get("customers", localId);
};

// Ledger
export const getCustomerLedger = async (customerLocalId: string): Promise<CustomerLedgerEntry[]> => {
  const db = await getDB();
  return (await db.getAllFromIndex("customerLedger", "by-customer", customerLocalId))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const addCustomerLedgerEntry = async (entry: Omit<CustomerLedgerEntry, "id" | "localId" | "createdAt" | "syncStatus">) => {
  const db = await getDB();
  const localId = generateLocalId();
  const record: CustomerLedgerEntry = { ...entry, id: "", localId, createdAt: new Date().toISOString(), syncStatus: "pending" };
  if (isOnline() && entry.customerId) {
    try {
      record.id = await saveLedgerToFirebase(record, entry.customerId);
      record.syncStatus = "synced";
    } catch (e) { console.warn(e); }
  }
  await db.put("customerLedger", record);
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
  const updated: Customer = {
    ...customer, currentBalance: Math.abs(balance),
    balanceType: balance >= 0 ? "payable" : "receivable", syncStatus: "pending",
  };
  if (isOnline() && updated.id) {
    try { await saveCustomerToFirebase(updated); updated.syncStatus = "synced"; } catch (e) { console.warn(e); }
  }
  await db.put("customers", updated);
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
  if (isOnline() && customer.id) {
    try {
      entry.id = await saveLedgerToFirebase(entry, customer.id);
      entry.syncStatus = "synced";
    } catch (e) { console.warn(e); }
  }
  await db.put("customerLedger", entry);
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
export const startCustomerAutoSync = () => {
  if (syncListenerAdded) return;
  syncListenerAdded = true;
  window.addEventListener("online", () => { syncCustomers().catch(console.error); });
  if (isOnline()) syncCustomers().catch(console.error);
};
