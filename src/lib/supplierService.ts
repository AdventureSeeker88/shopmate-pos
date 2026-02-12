import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, Timestamp, onSnapshot, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  cnic: string;
  openingBalance: number;
  balanceType: "payable" | "receivable";
  currentBalance: number;
  createdAt: Date;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  method: "cash" | "bank" | "wallet";
  date: Date;
  note: string;
  createdAt: Date;
}

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  date: Date;
  type: "purchase" | "payment";
  description: string;
  amount: number;
  balance: number;
}

const SUPPLIERS_COL = "suppliers";
const SUPPLIER_PAYMENTS_COL = "supplierPayments";
const SUPPLIER_LEDGER_COL = "supplierLedger";

// ─── Supplier CRUD ───

export const addSupplier = async (data: Omit<Supplier, "id" | "createdAt" | "currentBalance">) => {
  const docRef = await addDoc(collection(db, SUPPLIERS_COL), {
    ...data,
    currentBalance: data.openingBalance,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
};

export const updateSupplier = async (id: string, data: Partial<Omit<Supplier, "id" | "createdAt">>) => {
  await updateDoc(doc(db, SUPPLIERS_COL, id), data);
};

export const deleteSupplier = async (id: string) => {
  await deleteDoc(doc(db, SUPPLIERS_COL, id));
};

export const subscribeSuppliers = (callback: (suppliers: Supplier[]) => void) => {
  const q = query(collection(db, SUPPLIERS_COL), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const suppliers = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() || new Date(),
    })) as Supplier[];
    callback(suppliers);
  });
};

// ─── Supplier Payments ───

export const addSupplierPayment = async (payment: Omit<SupplierPayment, "id" | "createdAt">) => {
  // Add payment record
  const paymentRef = await addDoc(collection(db, SUPPLIER_PAYMENTS_COL), {
    ...payment,
    date: Timestamp.fromDate(payment.date),
    createdAt: Timestamp.now(),
  });

  // Add ledger entry
  await addDoc(collection(db, SUPPLIER_LEDGER_COL), {
    supplierId: payment.supplierId,
    date: Timestamp.fromDate(payment.date),
    type: "payment",
    description: `Payment via ${payment.method}${payment.note ? " - " + payment.note : ""}`,
    amount: payment.amount,
    createdAt: Timestamp.now(),
  });

  return paymentRef.id;
};

// ─── Supplier Ledger ───

export const subscribeSupplierLedger = (
  supplierId: string,
  callback: (entries: SupplierLedgerEntry[]) => void
) => {
  const q = query(
    collection(db, SUPPLIER_LEDGER_COL),
    where("supplierId", "==", supplierId),
    orderBy("date", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      date: d.data().date?.toDate?.() || new Date(),
    })) as SupplierLedgerEntry[];
    callback(entries);
  });
};

// ─── Balance Calculation ───

export const recalculateSupplierBalance = async (supplierId: string, openingBalance: number) => {
  // Get all ledger entries for this supplier
  const ledgerQuery = query(
    collection(db, SUPPLIER_LEDGER_COL),
    where("supplierId", "==", supplierId),
    orderBy("date", "asc")
  );
  const snapshot = await getDocs(ledgerQuery);

  let balance = openingBalance;
  for (const d of snapshot.docs) {
    const entry = d.data();
    if (entry.type === "purchase") {
      balance += entry.amount;
    } else if (entry.type === "payment") {
      balance -= entry.amount;
    }
  }

  const balanceType = balance >= 0 ? "payable" : "receivable";
  await updateDoc(doc(db, SUPPLIERS_COL, supplierId), {
    currentBalance: Math.abs(balance),
    balanceType,
  });

  return { currentBalance: Math.abs(balance), balanceType };
};
