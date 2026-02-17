import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  ShoppingCart, Package, Receipt, ArrowDownRight, ArrowUpRight, Wifi, WifiOff,
  Download, Banknote,
} from "lucide-react";
import { getAllSales, getAllSaleReturns, Sale, SaleReturn } from "@/lib/offlineSaleService";
import { getAllPurchases, getAllPurchaseReturns, Purchase, PurchaseReturn } from "@/lib/offlinePurchaseService";
import { getAllExpenses, Expense } from "@/lib/offlineExpenseService";
import { getAllCustomerLedgerEntries, CustomerLedgerEntry, getAllCustomers } from "@/lib/offlineCustomerService";
import { getAllSupplierPayments, SupplierPayment, getAllSuppliers } from "@/lib/offlineSupplierService";
import { format, subDays, addDays, isSameDay } from "date-fns";
import { getShopSettings } from "@/lib/shopSettings";

interface DayEntry {
  time: string;
  type: "sale" | "purchase" | "expense" | "sale_return" | "purchase_return" | "customer_payment" | "supplier_payment";
  description: string;
  amount: number;
  paid: number;
  remaining: number;
  cashFlow: "in" | "out" | "none";
}

const DayBook = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [customerLedger, setCustomerLedger] = useState<CustomerLedgerEntry[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, { name: string; balanceType: string }>>({});
  const [supplierMap, setSupplierMap] = useState<Record<string, { name: string; balanceType: string }>>({});
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [shopName, setShopName] = useState("Shop");
  const contentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, e, sr, pr, cl, sp, custs, supps, settings] = await Promise.all([
        getAllSales(), getAllPurchases(), getAllExpenses(), getAllSaleReturns(), getAllPurchaseReturns(),
        getAllCustomerLedgerEntries(), getAllSupplierPayments(), getAllCustomers(), getAllSuppliers(),
        getShopSettings(),
      ]);
      setSales(s); setPurchases(p); setExpenses(e); setSaleReturns(sr); setPurchaseReturns(pr);
      setCustomerLedger(cl); setSupplierPayments(sp);
      const cm: Record<string, { name: string; balanceType: string }> = {};
      custs.forEach(c => { cm[c.localId] = { name: c.name, balanceType: c.balanceType }; });
      setCustomerMap(cm);
      const sm: Record<string, { name: string; balanceType: string }> = {};
      supps.forEach(s => { sm[s.localId] = { name: s.name, balanceType: s.balanceType }; });
      setSupplierMap(sm);
      setShopName(settings.shopName || "Shop");
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
  // Only show standalone customer payments (previous due payments) - exclude sale-time auto-payments to avoid double counting
  const dayCustomerPayments = customerLedger.filter(l => 
    l.type === "payment" && 
    isSameDay(new Date(l.date), currentDate) && 
    !l.description.startsWith("Payment on ") &&
    !l.description.startsWith("Payment received")
  );
  const daySupplierPayments = supplierPayments.filter(sp => isSameDay(new Date(sp.date), currentDate));

  // Totals
  const totalSales = daySales.reduce((a, s) => a + s.totalAmount, 0);
  const totalSalesPaid = daySales.reduce((a, s) => a + s.paidAmount, 0);
  const totalPurchases = dayPurchases.reduce((a, p) => a + p.totalAmount, 0);
  const totalPurchasesPaid = dayPurchases.reduce((a, p) => a + p.paidAmount, 0);
  const totalExpenseAmt = dayExpenses.reduce((a, e) => a + e.amount, 0);
  const totalSaleReturnAmt = daySaleReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalPurchaseReturnAmt = dayPurchaseReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalSupplierPaymentsPaid = daySupplierPayments.filter(p => supplierMap[p.supplierLocalId]?.balanceType === "receivable").reduce((a, p) => a + p.amount, 0);
  const totalSupplierPaymentsReceived = daySupplierPayments.filter(p => supplierMap[p.supplierLocalId]?.balanceType === "payable").reduce((a, p) => a + p.amount, 0);
  // All customer payments are now payable only (customer pays to shop = cash in)
  const totalCustomerPaymentsReceived = dayCustomerPayments.reduce((a, p) => a + p.amount, 0);
  const totalCustomerPaymentsPaid = 0;

  const totalCostOfSales = daySales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.costPrice * i.quantity, 0), 0);
  const returnCost = daySaleReturns.reduce((a, r) => a + (r.costPrice || 0) * r.returnQuantity, 0);
  const grossProfit = (totalSales - totalSaleReturnAmt) - (totalCostOfSales - returnCost);
  const netProfit = grossProfit - totalExpenseAmt;

  const cashIn = totalSalesPaid + totalCustomerPaymentsReceived + totalPurchaseReturnAmt + totalSupplierPaymentsReceived;
  const cashOut = totalPurchasesPaid + totalExpenseAmt + totalSaleReturnAmt + totalSupplierPaymentsPaid + totalCustomerPaymentsPaid;
  const netCashFlow = cashIn - cashOut;

  // Build entries
  const entries: DayEntry[] = [
    ...daySales.map(s => ({
      time: format(new Date(s.saleDate), "HH:mm"),
      type: "sale" as const,
      description: `${s.invoiceNumber} — ${s.customerName}`,
      amount: s.totalAmount, paid: s.paidAmount, remaining: s.remainingAmount,
      cashFlow: "in" as const,
    })),
    ...dayPurchases.map(p => ({
      time: format(new Date(p.purchaseDate), "HH:mm"),
      type: "purchase" as const,
      description: `Purchase — ${p.supplierName}`,
      amount: p.totalAmount, paid: p.paidAmount, remaining: p.totalAmount - p.paidAmount,
      cashFlow: "out" as const,
    })),
    ...dayExpenses.map(e => ({
      time: format(new Date(e.date), "HH:mm"),
      type: "expense" as const,
      description: e.title,
      amount: e.amount, paid: e.amount, remaining: 0,
      cashFlow: "out" as const,
    })),
    ...daySaleReturns.map(r => ({
      time: format(new Date(r.returnDate), "HH:mm"),
      type: "sale_return" as const,
      description: `Sale Return — ${r.productName}`,
      amount: r.returnAmount, paid: r.returnAmount, remaining: 0,
      cashFlow: "out" as const,
    })),
    ...dayPurchaseReturns.map(r => ({
      time: format(new Date(r.returnDate), "HH:mm"),
      type: "purchase_return" as const,
      description: `Purchase Return — ${r.productName}`,
      amount: r.returnAmount, paid: r.returnAmount, remaining: 0,
      cashFlow: "in" as const,
    })),
    ...dayCustomerPayments.map(p => {
      const cust = customerMap[p.customerLocalId];
      return {
        time: format(new Date(p.date), "HH:mm"),
        type: "customer_payment" as const,
        description: `Customer Paid — ${cust?.name || "Customer"} — ${p.description}`,
        amount: p.amount, paid: p.amount, remaining: 0,
        cashFlow: "in" as "in" | "out",
      };
    }),
    ...daySupplierPayments.map(p => {
      const supp = supplierMap[p.supplierLocalId];
      const isPay = supp?.balanceType === "receivable"; // shop owes supplier → cash out
      return {
        time: format(new Date(p.date), "HH:mm"),
        type: "supplier_payment" as const,
        description: isPay
          ? `Paid to ${supp?.name || "Supplier"} — ${p.note || "Payment"}`
          : `Received from ${supp?.name || "Supplier"} — ${p.note || "Payment"}`,
        amount: p.amount, paid: p.amount, remaining: 0,
        cashFlow: (isPay ? "out" : "in") as "in" | "out",
      };
    }),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const typeBadge = (t: string) => {
    const colors: Record<string, string> = {
      sale: "bg-emerald-50 text-emerald-700", purchase: "bg-blue-50 text-blue-700",
      expense: "bg-red-50 text-red-700", sale_return: "bg-orange-50 text-orange-700",
      purchase_return: "bg-purple-50 text-purple-700",
      customer_payment: "bg-teal-50 text-teal-700", supplier_payment: "bg-indigo-50 text-indigo-700",
    };
    const labels: Record<string, string> = {
      sale: "Sale", purchase: "Purchase", expense: "Expense",
      sale_return: "Sale Return", purchase_return: "Purch Return",
      customer_payment: "Received", supplier_payment: "Paid",
    };
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[t] || ""}`}>{labels[t] || t}</span>;
  };

  const handleDownloadPDF = () => {
    const dateStr = format(currentDate, "dd-MM-yyyy");
    const dateFull = format(currentDate, "dd MMMM yyyy");

    let html = `
      <html><head><title>Day Book - ${dateStr}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; font-size: 12px; }
        h1 { text-align: center; margin-bottom: 2px; font-size: 18px; }
        h2 { text-align: center; margin-top: 2px; color: #666; font-size: 13px; font-weight: normal; }
        .summary { display: flex; justify-content: space-between; margin: 15px 0; gap: 10px; }
        .summary-box { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; flex: 1; text-align: center; }
        .summary-box .label { font-size: 10px; color: #888; text-transform: uppercase; }
        .summary-box .value { font-size: 16px; font-weight: bold; margin-top: 2px; }
        .green { color: #059669; } .red { color: #dc2626; } .blue { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
        td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .right { text-align: right; }
        .cash-in { color: #059669; font-weight: 600; }
        .cash-out { color: #dc2626; font-weight: 600; }
        .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
        .cashflow { display: flex; justify-content: space-around; margin: 10px 0; padding: 8px; background: #f9fafb; border-radius: 6px; }
        .cashflow div { text-align: center; }
        .cashflow .label { font-size: 10px; color: #888; }
        .cashflow .value { font-size: 14px; font-weight: bold; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${shopName}</h1>
      <h2>Day Book — ${dateFull}</h2>
      <div class="summary">
        <div class="summary-box"><div class="label">Sales</div><div class="value green">Rs. ${totalSales.toLocaleString()}</div>${totalSaleReturnAmt > 0 ? `<div style="font-size:9px;color:#ea580c;">Returns: Rs. ${totalSaleReturnAmt.toLocaleString()} | Net: Rs. ${(totalSales - totalSaleReturnAmt).toLocaleString()}</div>` : ''}</div>
        <div class="summary-box"><div class="label">Purchases</div><div class="value blue">Rs. ${totalPurchases.toLocaleString()}</div>${totalPurchaseReturnAmt > 0 ? `<div style="font-size:9px;color:#9333ea;">Returns: Rs. ${totalPurchaseReturnAmt.toLocaleString()} | Net: Rs. ${(totalPurchases - totalPurchaseReturnAmt).toLocaleString()}</div>` : ''}</div>
        <div class="summary-box"><div class="label">Expenses</div><div class="value red">Rs. ${totalExpenseAmt.toLocaleString()}</div></div>
        <div class="summary-box"><div class="label">Net Profit</div><div class="value ${netProfit >= 0 ? 'green' : 'red'}">Rs. ${Math.abs(netProfit).toLocaleString()}</div></div>
      </div>
      <div class="cashflow">
        <div><div class="label">Cash In</div><div class="value green">Rs. ${cashIn.toLocaleString()}</div></div>
        <div><div class="label">Cash Out</div><div class="value red">Rs. ${cashOut.toLocaleString()}</div></div>
        <div><div class="label">Net Cash Flow</div><div class="value ${netCashFlow >= 0 ? 'green' : 'red'}">Rs. ${Math.abs(netCashFlow).toLocaleString()}</div></div>
        <div><div class="label">Cust. Received</div><div class="value green">Rs. ${totalCustomerPaymentsReceived.toLocaleString()}</div></div>
        <div><div class="label">Cust. Paid</div><div class="value red">Rs. ${totalCustomerPaymentsPaid.toLocaleString()}</div></div>
        <div><div class="label">Supp. Paid</div><div class="value red">Rs. ${totalSupplierPaymentsPaid.toLocaleString()}</div></div>
        <div><div class="label">Supp. Received</div><div class="value green">Rs. ${totalSupplierPaymentsReceived.toLocaleString()}</div></div>
      </div>
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Description</th><th class="right">Amount</th><th class="right">Cash In</th><th class="right">Cash Out</th></tr></thead>
        <tbody>`;

    entries.forEach(e => {
      const isIn = e.cashFlow === "in";
      html += `<tr>
        <td>${e.time}</td>
        <td>${e.type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</td>
        <td>${e.description}</td>
        <td class="right">Rs. ${e.amount.toLocaleString()}</td>
        <td class="right ${isIn ? 'cash-in' : ''}">${isIn ? `Rs. ${e.paid.toLocaleString()}` : '—'}</td>
        <td class="right ${!isIn ? 'cash-out' : ''}">${!isIn ? `Rs. ${e.paid.toLocaleString()}` : '—'}</td>
      </tr>`;
    });

    html += `</tbody></table>
      <div class="footer">Generated on ${format(new Date(), "dd MMM yyyy HH:mm")} — ${shopName}</div>
      </body></html>`;

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.onload = () => { printWin.print(); };
    }
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
          <Button variant="outline" size="sm" className="gap-1" onClick={handleDownloadPDF}>
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
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
            {totalSaleReturnAmt > 0 && (
              <p className="text-[10px] text-orange-600 font-medium">Returns: Rs. {totalSaleReturnAmt.toLocaleString()} ({daySaleReturns.length})</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Net: Rs. {(totalSales - totalSaleReturnAmt).toLocaleString()} | Received: Rs. {totalSalesPaid.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-200/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground font-medium">Purchases</span>
            </div>
            <p className="text-lg font-bold text-blue-700">Rs. {totalPurchases.toLocaleString()}</p>
            {totalPurchaseReturnAmt > 0 && (
              <p className="text-[10px] text-purple-600 font-medium">Returns: Rs. {totalPurchaseReturnAmt.toLocaleString()} ({dayPurchaseReturns.length})</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Net: Rs. {(totalPurchases - totalPurchaseReturnAmt).toLocaleString()} | Paid: Rs. {totalPurchasesPaid.toLocaleString()}
            </p>
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
            {(totalSaleReturnAmt > 0 || totalPurchaseReturnAmt > 0) && (
              <p className="text-[10px] text-orange-600">Margin adjusted for returns</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
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
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Cust. Received</p>
              <p className="text-sm font-bold text-teal-600">Rs. {totalCustomerPaymentsReceived.toLocaleString()}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Cust. Paid</p>
              <p className="text-sm font-bold text-destructive">Rs. {totalCustomerPaymentsPaid.toLocaleString()}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Supp. Paid</p>
              <p className="text-sm font-bold text-indigo-600">Rs. {totalSupplierPaymentsPaid.toLocaleString()}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground">Supp. Received</p>
              <p className="text-sm font-bold text-teal-600">Rs. {totalSupplierPaymentsReceived.toLocaleString()}</p>
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
                  <TableHead className="text-[10px] text-right">Cash In</TableHead>
                  <TableHead className="text-[10px] text-right">Cash Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{e.time}</TableCell>
                    <TableCell>{typeBadge(e.type)}</TableCell>
                    <TableCell className="text-xs max-w-[250px] truncate">{e.description}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">Rs. {e.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600">
                      {e.cashFlow === "in" ? `Rs. ${e.paid.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-destructive">
                      {e.cashFlow === "out" ? `Rs. ${e.paid.toLocaleString()}` : "—"}
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
