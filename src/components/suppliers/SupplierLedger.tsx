import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { subscribeSupplierLedger, Supplier, SupplierLedgerEntry } from "@/lib/supplierService";
import { format } from "date-fns";

interface Props {
  supplier: Supplier;
  onBack: () => void;
}

const SupplierLedger = ({ supplier, onBack }: Props) => {
  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([]);

  useEffect(() => {
    const unsub = subscribeSupplierLedger(supplier.id, setEntries);
    return unsub;
  }, [supplier.id]);

  // Calculate running balance
  let runningBalance = supplier.openingBalance;
  const entriesWithBalance = entries.map((entry) => {
    if (entry.type === "purchase") {
      runningBalance += entry.amount;
    } else {
      runningBalance -= entry.amount;
    }
    return { ...entry, runningBalance };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{supplier.name} — Ledger</h2>
          <p className="text-sm text-muted-foreground">Phone: {supplier.phone}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm text-muted-foreground">Current Balance</p>
          <p className="text-lg font-bold text-foreground">
            Rs. {supplier.currentBalance?.toLocaleString() || 0}
          </p>
          <Badge variant={supplier.balanceType === "payable" ? "destructive" : "default"}>
            {supplier.balanceType}
          </Badge>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Opening balance row */}
            <TableRow>
              <TableCell>{format(supplier.createdAt, "dd MMM yyyy")}</TableCell>
              <TableCell><Badge variant="outline">Opening</Badge></TableCell>
              <TableCell>Opening Balance</TableCell>
              <TableCell className="text-right">Rs. {supplier.openingBalance?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right font-medium">Rs. {supplier.openingBalance?.toLocaleString() || 0}</TableCell>
            </TableRow>
            {entriesWithBalance.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{format(entry.date, "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Badge variant={entry.type === "purchase" ? "secondary" : "default"}>
                    {entry.type}
                  </Badge>
                </TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell className="text-right">
                  <span className={entry.type === "payment" ? "text-green-600" : "text-destructive"}>
                    {entry.type === "payment" ? "-" : "+"}Rs. {entry.amount.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  Rs. {Math.abs(entry.runningBalance).toLocaleString()}{" "}
                  <span className="text-xs text-muted-foreground">
                    {entry.runningBalance >= 0 ? "Payable" : "Receivable"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {entriesWithBalance.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No transactions yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SupplierLedger;
