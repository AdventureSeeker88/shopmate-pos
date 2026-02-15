import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight,
  ShoppingCart, Package, Receipt, ArrowDownRight, ArrowUpRight, Wifi, WifiOff,
} from "lucide-react";
import { getAllSales, getAllSaleReturns, Sale, SaleReturn } from "@/lib/offlineSaleService";
import { getAllPurchases, getAllPurchaseReturns, Purchase, PurchaseReturn } from "@/lib/offlinePurchaseService";
import { getAllExpenses, Expense } from "@/lib/offlineExpenseService";
import { format, addDays, subDays, isSameDay } from "date-fns";

interface DayEntry {
  time: string;
  type: "sale" | "purchase" | "expense" | "sale_return" | "purchase_return";
  description: string;
  amount: number;
  paid: number;
  remaining: number;
}

const DayBook = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, e, sr, pr] = await Promise.all([getAllSales(), getAllPurchases(), getAllExpenses(), getAllSaleReturns(), getAllPurchaseReturns()]);
      setSales(s); setPurchases(p); setExpenses(e); setSaleReturns(sr); setPurchaseReturns(pr);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  // Filter by date
  const daySales = sales.filter(s => isSameDay(new Date(s.saleDate), currentDate));
  const dayPurchases = purchases.filter(p => isSameDay(new Date(p.purchaseDate), currentDate));
  const dayExpenses = expenses.filter(e => isSameDay(new Date(e.date), currentDate));
  const daySaleReturns = saleReturns.filter(r => isSameDay(new Date(r.returnDate), currentDate));
  const dayPurchaseReturns = purchaseReturns.filter(r => isSameDay(new Date(r.returnDate), currentDate));

  // Totals
  const totalSales = daySales.reduce((a, s) => a + s.totalAmount, 0);
  const totalSalesPaid = daySales.reduce((a, s) => a + s.paidAmount, 0);
  const totalPurchases = dayPurchases.reduce((a, p) => a + p.totalAmount, 0);
  const totalPurchasesPaid = dayPurchases.reduce((a, p) => a + p.paidAmount, 0);
  const totalExpenseAmt = dayExpenses.reduce((a, e) => a + e.amount, 0);
  const totalSaleReturnAmt = daySaleReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalPurchaseReturnAmt = dayPurchaseReturns.reduce((a, r) => a + r.returnAmount, 0);

  const totalCostOfSales = daySales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.costPrice * i.quantity, 0), 0);
  const returnCost = daySaleReturns.reduce((a, r) => a + (r.costPrice || 0) * r.returnQuantity, 0);
  const grossProfit = (totalSales - totalSaleReturnAmt) - (totalCostOfSales - returnCost);
  const netProfit = grossProfit - totalExpenseAmt;

  const cashIn = totalSalesPaid;
  const cashOut = totalPurchasesPaid + totalExpenseAmt + totalSaleReturnAmt;
  const netCashFlow = cashIn - cashOut + totalPurchaseReturnAmt;

  // Build entries
  const entries: DayEntry[] = [
    ...daySales.map(s => ({
      time: format(new Date(s.saleDate), "HH:mm"),
      type: "sale" as const,
      description: `${s.invoiceNumber} — ${s.customerName}`,
      amount: s.totalAmount,
      paid: s.paidAmount,
      remaining: s.remainingAmount,
    })),
    ...dayPurchases.map(p => ({
      time: format(new Date(p.purchaseDate), "HH:mm"),
      type: "purchase" as const,
      description: `Purchase — ${p.supplierName}`,
      amount: p.totalAmount,
      paid: p.paidAmount,
      remaining: p.totalAmount - p.paidAmount,
    })),
    ...dayExpenses.map(e => ({
      time: format(new Date(e.date), "HH:mm"),
      type: "expense" as const,
      description: e.title,
      amount: e.amount,
      paid: e.amount,
      remaining: 0,
    })),
    ...daySaleReturns.map(r => ({
      time: format(new Date(r.returnDate), "HH:mm"),
      type: "sale_return" as const,
      description: `Sale Return — ${r.productName}`,
      amount: r.returnAmount,
      paid: r.returnAmount,
      remaining: 0,
    })),
    ...dayPurchaseReturns.map(r => ({
      time: format(new Date(r.returnDate), "HH:mm"),
      type: "purchase_return" as const,
      description: `Purchase Return — ${r.productName}`,
      amount: r.returnAmount,
      paid: r.returnAmount,
      remaining: 0,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const typeIcon = (t: string) => {
    if (t === "sale") return <ShoppingCart className="h-3 w-3 text-emerald-600" />;
    if (t === "purchase") return <Package className="h-3 w-3 text-blue-600" />;
    if (t === "sale_return") return <ArrowUpRight className="h-3 w-3 text-orange-600" />;
    if (t === "purchase_return") return <ArrowDownRight className="h-3 w-3 text-purple-600" />;
    return <Receipt className="h-3 w-3 text-destructive" />;
  };

  const typeBadge = (t: string) => {
    const colors: Record<string, string> = { 
      sale: "bg-emerald-50 text-emerald-700", purchase: "bg-blue-50 text-blue-700", 
      expense: "bg-red-50 text-red-700", sale_return: "bg-orange-50 text-orange-700",
      purchase_return: "bg-purple-50 text-purple-700",
    };
    const labels: Record<string, string> = { sale: "Sale", purchase: "Purchase", expense: "Expense", sale_return: "Sale Return", purchase_return: "Purch Return" };
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[t] || ""}`}>{labels[t] || t}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Day Book</h1>
          <p className="text-sm text-muted-foreground">Daily financial summary</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "destructive"} className="gap-1 text-xs">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(d => subDays(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <Input type="date" className="h-6 text-xs border-0 p-0 w-28" 
                value={format(currentDate, "yyyy-MM-dd")} 
                onChange={e => setCurrentDate(new Date(e.target.value))} />
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(d => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-emerald-50/50 border-emerald-200/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownRight className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">Sales</span>
            </div>
            <p className="text-lg font-bold text-emerald-700">Rs. {totalSales.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Received: Rs. {totalSalesPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-200/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground font-medium">Purchases</span>
            </div>
            <p className="text-lg font-bold text-blue-700">Rs. {totalPurchases.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Paid: Rs. {totalPurchasesPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50/50 border-red-200/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground font-medium">Expenses</span>
            </div>
            <p className="text-lg font-bold text-destructive">Rs. {totalExpenseAmt.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{dayExpenses.length} entries</p>
          </CardContent>
        </Card>
        <Card className={`${netProfit >= 0 ? "bg-emerald-50/50 border-emerald-200/50" : "bg-red-50/50 border-red-200/50"}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className={`h-4 w-4 ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`} />
              <span className="text-xs text-muted-foreground font-medium">Net Profit</span>
            </div>
            <p className={`text-lg font-bold ${netProfit >= 0 ? "text-emerald-700" : "text-destructive"}`}>
              Rs. {Math.abs(netProfit).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Gross: Rs. {grossProfit.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground">Cash In</p>
              <p className="text-sm font-bold text-emerald-600">Rs. {cashIn.toLocaleString()}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Cash Out</p>
              <p className="text-sm font-bold text-destructive">Rs. {cashOut.toLocaleString()}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Net Cash Flow</p>
              <p className={`text-sm font-bold ${netCashFlow >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                Rs. {Math.abs(netCashFlow).toLocaleString()}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">{entries.length} transactions</Badge>
        </CardContent>
      </Card>

      {/* Transaction Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transactions — {format(currentDate, "dd MMMM yyyy")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No transactions for this day</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Time</TableHead>
                  <TableHead className="text-[10px]">Type</TableHead>
                  <TableHead className="text-[10px]">Description</TableHead>
                  <TableHead className="text-[10px] text-right">Amount</TableHead>
                  <TableHead className="text-[10px] text-right">Paid</TableHead>
                  <TableHead className="text-[10px] text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{e.time}</TableCell>
                    <TableCell>{typeBadge(e.type)}</TableCell>
                    <TableCell className="text-xs max-w-[250px] truncate">{e.description}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">Rs. {e.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600">Rs. {e.paid.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right text-destructive">
                      {e.remaining > 0 ? `Rs. ${e.remaining.toLocaleString()}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DayBook;
