import { useEffect, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getCustomerLedger, getAllCustomers, Customer, CustomerLedgerEntry } from "@/lib/offlineCustomerService";
import { format } from "date-fns";

interface Props {
  customer: Customer;
  onBack: () => void;
}

const CustomerLedgerView = ({ customer: initialCustomer, onBack }: Props) => {
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [customer, setCustomer] = useState<Customer>(initialCustomer);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data, allCustomers] = await Promise.all([
        getCustomerLedger(customer.localId),
        getAllCustomers(),
      ]);
      setEntries(data);
      const updated = allCustomers.find(c => c.localId === customer.localId);
      if (updated) setCustomer(updated);
    } finally { setRefreshing(false); }
  }, [customer.localId]);

  useEffect(() => { loadData(); }, [loadData]);

  let runningBalance = customer.openingBalance;
  const entriesWithBalance = entries.map((entry) => {
    if (entry.type === "sale") runningBalance += entry.amount;
    else runningBalance -= entry.amount;
    return { ...entry, runningBalance };
  });

  const totalSales = entries.filter(e => e.type === "sale").reduce((s, e) => s + e.amount, 0);
  const totalPayments = entries.filter(e => e.type === "payment").reduce((s, e) => s + e.amount, 0);
  const totalReturns = entries.filter(e => e.type === "sale_return").reduce((s, e) => s + e.amount, 0);
  const pendingPayable = totalSales - totalPayments - totalReturns + (customer.openingBalance || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{customer.name} — Ledger</h2>
          <p className="text-sm text-muted-foreground">Phone: {customer.phone}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className="text-lg font-bold text-foreground">Rs. {customer.currentBalance?.toLocaleString() || 0}</p>
            <Badge variant={customer.balanceType === "payable" ? "destructive" : "default"}>{customer.balanceType}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-lg font-bold text-foreground">Rs. {totalSales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Payments</p>
            <p className="text-lg font-bold text-primary">Rs. {totalPayments.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Returns</p>
            <p className="text-lg font-bold text-foreground">Rs. {totalReturns.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Pending Payable</p>
            <p className={`text-lg font-bold ${pendingPayable > 0 ? "text-destructive" : "text-primary"}`}>
              Rs. {Math.abs(pendingPayable).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">{pendingPayable > 0 ? "Customer Owes" : pendingPayable < 0 ? "You Owe" : "Settled"}</p>
          </CardContent>
        </Card>
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
              <TableCell>{format(new Date(customer.createdAt), "dd MMM yyyy")}</TableCell>
              <TableCell><Badge variant="outline">Opening</Badge></TableCell>
              <TableCell>Opening Balance</TableCell>
              <TableCell className="text-right">Rs. {customer.openingBalance?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right font-medium">Rs. {customer.openingBalance?.toLocaleString() || 0}</TableCell>
              <TableCell>—</TableCell>
            </TableRow>
            {entriesWithBalance.map((entry) => (
              <TableRow key={entry.localId}>
                <TableCell>{format(new Date(entry.date), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Badge variant={entry.type === "sale" ? "secondary" : entry.type === "payment" ? "default" : "destructive"}>
                    {entry.type === "sale_return" ? "return" : entry.type}
                  </Badge>
                </TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell className="text-right">
                  <span className={entry.type === "sale" ? "text-destructive" : "text-primary"}>
                    {entry.type === "sale" ? "+" : "-"}Rs. {entry.amount.toLocaleString()}
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

export default CustomerLedgerView;
