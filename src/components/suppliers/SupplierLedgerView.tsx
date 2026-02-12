import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { getSupplierLedger, Supplier, SupplierLedgerEntry } from "@/lib/offlineSupplierService";
import { format } from "date-fns";

interface Props {
  supplier: Supplier;
  onBack: () => void;
}

const SupplierLedgerView = ({ supplier, onBack }: Props) => {
  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([]);

  const loadEntries = async () => {
    const data = await getSupplierLedger(supplier.localId);
    setEntries(data);
  };

  useEffect(() => { loadEntries(); }, [supplier.localId]);

  // Calculate running balance
  let runningBalance = supplier.openingBalance;
  const entriesWithBalance = entries.map((entry) => {
    if (entry.type === "purchase") runningBalance += entry.amount;
    else runningBalance -= entry.amount;
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
          <p className="text-lg font-bold text-foreground">Rs. {supplier.currentBalance?.toLocaleString() || 0}</p>
          <Badge variant={supplier.balanceType === "payable" ? "destructive" : "default"}>{supplier.balanceType}</Badge>
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
              <TableHead>Sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{format(new Date(supplier.createdAt), "dd MMM yyyy")}</TableCell>
              <TableCell><Badge variant="outline">Opening</Badge></TableCell>
              <TableCell>Opening Balance</TableCell>
              <TableCell className="text-right">Rs. {supplier.openingBalance?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right font-medium">Rs. {supplier.openingBalance?.toLocaleString() || 0}</TableCell>
              <TableCell>—</TableCell>
            </TableRow>
            {entriesWithBalance.map((entry) => (
              <TableRow key={entry.localId}>
                <TableCell>{format(new Date(entry.date), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Badge variant={entry.type === "purchase" ? "secondary" : "default"}>{entry.type}</Badge>
                </TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell className="text-right">
                  <span className={entry.type === "payment" ? "text-green-600" : "text-destructive"}>
                    {entry.type === "payment" ? "-" : "+"}Rs. {entry.amount.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  Rs. {Math.abs(entry.runningBalance).toLocaleString()}{" "}
                  <span className="text-xs text-muted-foreground">{entry.runningBalance >= 0 ? "Payable" : "Receivable"}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={entry.syncStatus === "synced" ? "default" : "secondary"} className="text-xs">
                    {entry.syncStatus === "synced" ? "✓" : "⏳"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {entriesWithBalance.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SupplierLedgerView;
