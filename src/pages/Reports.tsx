import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Wifi, WifiOff, Printer, Download, Calendar, TrendingUp, TrendingDown,
  ShoppingCart, Package, DollarSign, BarChart3, ArrowDownRight, ArrowUpRight,
} from "lucide-react";
import { getAllSales, getAllSaleReturns, Sale, SaleReturn } from "@/lib/offlineSaleService";
import { getAllPurchases, getAllPurchaseReturns, Purchase, PurchaseReturn } from "@/lib/offlinePurchaseService";
import { getAllExpenses, Expense } from "@/lib/offlineExpenseService";
import { getShopSettings } from "@/lib/shopSettings";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, isWithinInterval, subDays,
} from "date-fns";

type Period = "daily" | "weekly" | "monthly" | "yearly";
type ReportType = "sales" | "purchases" | "items" | "margin" | "payment";

const Reports = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [period, setPeriod] = useState<Period>("daily");
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [customDate, setCustomDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const printRef = useRef<HTMLDivElement>(null);

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

  const baseDate = new Date(customDate);
  const getRange = (p: Period) => {
    if (p === "daily") return { start: startOfDay(baseDate), end: endOfDay(baseDate) };
    if (p === "weekly") return { start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) };
    if (p === "monthly") return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
    return { start: startOfYear(baseDate), end: endOfYear(baseDate) };
  };

  const range = getRange(period);
  const periodLabel = period === "daily" ? format(range.start, "dd MMM yyyy")
    : period === "weekly" ? `${format(range.start, "dd MMM")} — ${format(range.end, "dd MMM yyyy")}`
    : period === "monthly" ? format(range.start, "MMMM yyyy")
    : format(range.start, "yyyy");

  const filteredSales = sales.filter(s => isWithinInterval(new Date(s.saleDate), range));
  const filteredPurchases = purchases.filter(p => isWithinInterval(new Date(p.purchaseDate), range));
  const filteredExpenses = expenses.filter(e => isWithinInterval(new Date(e.date), range));
  const filteredSaleReturns = saleReturns.filter(r => isWithinInterval(new Date(r.returnDate), range));
  const filteredPurchaseReturns = purchaseReturns.filter(r => isWithinInterval(new Date(r.returnDate), range));

  // Summaries
  const totalSalesAmt = filteredSales.reduce((a, s) => a + s.totalAmount, 0);
  const totalSalesPaid = filteredSales.reduce((a, s) => a + s.paidAmount, 0);
  const totalSalesRemaining = filteredSales.reduce((a, s) => a + s.remainingAmount, 0);
  const totalCost = filteredSales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.costPrice * i.quantity, 0), 0);
  const totalSaleReturnAmt = filteredSaleReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalSaleReturnCost = filteredSaleReturns.reduce((a, r) => a + (r.costPrice || 0) * r.returnQuantity, 0);
  const totalPurchaseReturnAmt = filteredPurchaseReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalMargin = (totalSalesAmt - totalSaleReturnAmt) - (totalCost - totalSaleReturnCost);
  const totalPurchasesAmt = filteredPurchases.reduce((a, p) => a + p.totalAmount, 0) - totalPurchaseReturnAmt;
  const totalPurchasesPaid = filteredPurchases.reduce((a, p) => a + p.paidAmount, 0);
  const totalExpensesAmt = filteredExpenses.reduce((a, e) => a + e.amount, 0);
  const netProfit = totalMargin - totalExpensesAmt;

  // Item-wise aggregation
  const itemMap = new Map<string, { name: string; qty: number; revenue: number; cost: number; margin: number }>();
  filteredSales.forEach(s => s.items.forEach(i => {
    const key = i.productLocalId || i.productName;
    const existing = itemMap.get(key) || { name: i.productName, qty: 0, revenue: 0, cost: 0, margin: 0 };
    existing.qty += i.quantity;
    existing.revenue += i.total;
    existing.cost += i.costPrice * i.quantity;
    existing.margin += i.total - i.costPrice * i.quantity;
    itemMap.set(key, existing);
  }));
  const itemRows = Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Payment method aggregation
  const paymentMap = { cash: 0, bank: 0, wallet: 0 };
  filteredSales.forEach(s => {
    const m = (s as any).paymentMethod || "cash";
    paymentMap[m as keyof typeof paymentMap] += s.paidAmount;
  });

  // Purchase item-wise
  const purchaseItemMap = new Map<string, { name: string; qty: number; total: number }>();
  filteredPurchases.forEach(p => p.items.forEach(i => {
    const key = i.productLocalId || i.productName;
    const existing = purchaseItemMap.get(key) || { name: i.productName, qty: 0, total: 0 };
    existing.qty += i.quantity;
    existing.total += i.total;
    purchaseItemMap.set(key, existing);
  }));
  const purchaseItemRows = Array.from(purchaseItemMap.values()).sort((a, b) => b.total - a.total);

  const shop = getShopSettings();

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Report - ${periodLabel}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Arial,sans-serif; padding:10mm; font-size:11px; }
      h1 { font-size:16px; text-align:center; margin-bottom:2mm; }
      h2 { font-size:13px; margin:5mm 0 2mm; }
      .meta { text-align:center; color:#666; margin-bottom:5mm; font-size:10px; }
      table { width:100%; border-collapse:collapse; margin-bottom:5mm; }
      th,td { border:1px solid #ddd; padding:3px 6px; text-align:left; }
      th { background:#f5f5f5; font-weight:600; }
      .right { text-align:right; }
      .bold { font-weight:700; }
      .summary { display:flex; gap:10mm; margin-bottom:5mm; }
      .summary-card { border:1px solid #ddd; padding:3mm; border-radius:2mm; flex:1; }
      .summary-card .label { font-size:9px; color:#666; }
      .summary-card .value { font-size:14px; font-weight:700; }
      @media print { body { padding:5mm; } }
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const handleDownloadPDF = () => {
    // Use print dialog's "Save as PDF" feature
    handlePrint();
  };

  const reportTabs = [
    { key: "sales" as const, label: "Sales Report" },
    { key: "purchases" as const, label: "Purchase Report" },
    { key: "items" as const, label: "Item Wise" },
    { key: "margin" as const, label: "Margin Report" },
    { key: "payment" as const, label: "Payment Wise" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Comprehensive business analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "destructive"} className="gap-1 text-xs">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Period Selection */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={period} onValueChange={v => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input type="date" className="h-6 text-xs border-0 p-0 w-28"
            value={customDate} onChange={e => setCustomDate(e.target.value)} />
        </div>
        <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Sales</span>
            </div>
            <p className="text-lg font-bold">Rs. {totalSalesAmt.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{filteredSales.length} invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-blue-600" />
              <span className="text-[10px] text-muted-foreground font-medium">Purchases</span>
            </div>
            <p className="text-lg font-bold">Rs. {totalPurchasesAmt.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{filteredPurchases.length} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground font-medium">Gross Margin</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">Rs. {totalMargin.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{totalSalesAmt > 0 ? ((totalMargin / totalSalesAmt) * 100).toFixed(1) : 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-[10px] text-muted-foreground font-medium">Expenses</span>
            </div>
            <p className="text-lg font-bold text-destructive">Rs. {totalExpensesAmt.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{filteredExpenses.length} entries</p>
          </CardContent>
        </Card>
        <Card className={netProfit >= 0 ? "border-emerald-200" : "border-destructive/30"}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`h-4 w-4 ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`} />
              <span className="text-[10px] text-muted-foreground font-medium">Net Profit</span>
            </div>
            <p className={`text-lg font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              Rs. {Math.abs(netProfit).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">{netProfit >= 0 ? "Profit" : "Loss"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Report Type Tabs */}
      <Tabs value={reportType} onValueChange={v => setReportType(v as ReportType)}>
        <TabsList className="flex-wrap h-auto">
          {reportTabs.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Sales Report */}
        <TabsContent value="sales" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Sales Report — {periodLabel}</CardTitle>
                <div className="flex gap-3 text-xs">
                  <span>Paid: <strong className="text-emerald-600">Rs. {totalSalesPaid.toLocaleString()}</strong></span>
                  <span>Pending: <strong className="text-destructive">Rs. {totalSalesRemaining.toLocaleString()}</strong></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredSales.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No sales in this period</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Date</TableHead>
                      <TableHead className="text-[10px]">Invoice</TableHead>
                      <TableHead className="text-[10px]">Customer</TableHead>
                      <TableHead className="text-[10px]">Items</TableHead>
                      <TableHead className="text-[10px] text-right">Total</TableHead>
                      <TableHead className="text-[10px] text-right">Paid</TableHead>
                      <TableHead className="text-[10px] text-right">Remaining</TableHead>
                      <TableHead className="text-[10px] text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(s => {
                      const cost = s.items.reduce((a, i) => a + i.costPrice * i.quantity, 0);
                      const margin = s.totalAmount - cost;
                      return (
                        <TableRow key={s.localId}>
                          <TableCell className="text-[10px]">{format(new Date(s.saleDate), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-[10px] font-mono">{s.invoiceNumber}</TableCell>
                          <TableCell className="text-[10px]">{s.customerName}</TableCell>
                          <TableCell className="text-[10px]">{s.items.length}</TableCell>
                          <TableCell className="text-[10px] text-right font-semibold">Rs. {s.totalAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-[10px] text-right text-emerald-600">Rs. {s.paidAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-[10px] text-right text-destructive">
                            {s.remainingAmount > 0 ? `Rs. ${s.remainingAmount.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-[10px] text-right font-semibold text-primary">Rs. {margin.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4} className="text-xs">Total ({filteredSales.length} sales)</TableCell>
                      <TableCell className="text-xs text-right">Rs. {totalSalesAmt.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">Rs. {totalSalesPaid.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-destructive">Rs. {totalSalesRemaining.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-primary">Rs. {totalMargin.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Report */}
        <TabsContent value="purchases" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Purchase Report — {periodLabel}</CardTitle>
                <div className="flex gap-3 text-xs">
                  <span>Paid: <strong className="text-emerald-600">Rs. {totalPurchasesPaid.toLocaleString()}</strong></span>
                  <span>Pending: <strong className="text-destructive">Rs. {(totalPurchasesAmt - totalPurchasesPaid).toLocaleString()}</strong></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredPurchases.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No purchases in this period</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Date</TableHead>
                      <TableHead className="text-[10px]">Supplier</TableHead>
                      <TableHead className="text-[10px]">Items</TableHead>
                      <TableHead className="text-[10px] text-right">Total</TableHead>
                      <TableHead className="text-[10px] text-right">Paid</TableHead>
                      <TableHead className="text-[10px] text-right">Pending</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.map(p => (
                      <TableRow key={p.localId}>
                        <TableCell className="text-[10px]">{format(new Date(p.purchaseDate), "dd/MM/yy")}</TableCell>
                        <TableCell className="text-[10px]">{p.supplierName}</TableCell>
                        <TableCell className="text-[10px]">{p.items.length}</TableCell>
                        <TableCell className="text-[10px] text-right font-semibold">Rs. {p.totalAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right text-emerald-600">Rs. {p.paidAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right text-destructive">
                          Rs. {(p.totalAmount - p.paidAmount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.paymentStatus === "paid" ? "default" : "destructive"} className="text-[9px]">
                            {p.paymentStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={3} className="text-xs">Total ({filteredPurchases.length} purchases)</TableCell>
                      <TableCell className="text-xs text-right">Rs. {totalPurchasesAmt.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">Rs. {totalPurchasesPaid.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-destructive">Rs. {(totalPurchasesAmt - totalPurchasesPaid).toLocaleString()}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Item Wise Report */}
        <TabsContent value="items" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Item Wise Sales — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {itemRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No items sold in this period</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">#</TableHead>
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="text-[10px] text-right">Qty Sold</TableHead>
                      <TableHead className="text-[10px] text-right">Revenue</TableHead>
                      <TableHead className="text-[10px] text-right">Cost</TableHead>
                      <TableHead className="text-[10px] text-right">Margin</TableHead>
                      <TableHead className="text-[10px] text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[10px]">{i + 1}</TableCell>
                        <TableCell className="text-[10px] font-medium">{r.name}</TableCell>
                        <TableCell className="text-[10px] text-right">{r.qty}</TableCell>
                        <TableCell className="text-[10px] text-right font-semibold">Rs. {r.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right text-muted-foreground">Rs. {r.cost.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right font-semibold text-primary">Rs. {r.margin.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right">{r.revenue > 0 ? ((r.margin / r.revenue) * 100).toFixed(1) : 0}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2} className="text-xs">Total ({itemRows.length} products)</TableCell>
                      <TableCell className="text-xs text-right">{itemRows.reduce((a, r) => a + r.qty, 0)}</TableCell>
                      <TableCell className="text-xs text-right">Rs. {itemRows.reduce((a, r) => a + r.revenue, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">Rs. {itemRows.reduce((a, r) => a + r.cost, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-primary">Rs. {itemRows.reduce((a, r) => a + r.margin, 0).toLocaleString()}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Purchase Items */}
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Item Wise Purchases — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {purchaseItemRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No purchases in this period</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">#</TableHead>
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="text-[10px] text-right">Qty Purchased</TableHead>
                      <TableHead className="text-[10px] text-right">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseItemRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[10px]">{i + 1}</TableCell>
                        <TableCell className="text-[10px] font-medium">{r.name}</TableCell>
                        <TableCell className="text-[10px] text-right">{r.qty}</TableCell>
                        <TableCell className="text-[10px] text-right font-semibold">Rs. {r.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Margin Report */}
        <TabsContent value="margin" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Margin / Profit Report — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Total Revenue</p>
                  <p className="text-lg font-bold">Rs. {totalSalesAmt.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Cost of Goods</p>
                  <p className="text-lg font-bold">Rs. {totalCost.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3 border-emerald-200">
                  <p className="text-[10px] text-muted-foreground">Gross Margin</p>
                  <p className="text-lg font-bold text-emerald-600">Rs. {totalMargin.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{totalSalesAmt > 0 ? ((totalMargin / totalSalesAmt) * 100).toFixed(1) : 0}% margin</p>
                </div>
                <div className={`rounded-lg border p-3 ${netProfit >= 0 ? "border-emerald-200" : "border-destructive/30"}`}>
                  <p className="text-[10px] text-muted-foreground">Net Profit (after expenses)</p>
                  <p className={`text-lg font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    Rs. {Math.abs(netProfit).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Expenses: Rs. {totalExpensesAmt.toLocaleString()}</p>
                </div>
              </div>

              <Separator />

              {/* Top 5 profitable items */}
              <div>
                <h3 className="text-xs font-semibold mb-2">Top Profitable Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="text-[10px] text-right">Revenue</TableHead>
                      <TableHead className="text-[10px] text-right">Cost</TableHead>
                      <TableHead className="text-[10px] text-right">Margin</TableHead>
                      <TableHead className="text-[10px] text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemRows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[10px] font-medium">{r.name}</TableCell>
                        <TableCell className="text-[10px] text-right">Rs. {r.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right">Rs. {r.cost.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right font-semibold text-primary">Rs. {r.margin.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-right">{r.revenue > 0 ? ((r.margin / r.revenue) * 100).toFixed(1) : 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Wise Report */}
        <TabsContent value="payment" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payment Method Report — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: "cash", label: "💵 Cash", amount: paymentMap.cash, color: "border-emerald-200" },
                  { key: "bank", label: "🏦 Bank", amount: paymentMap.bank, color: "border-blue-200" },
                  { key: "wallet", label: "📱 Wallet", amount: paymentMap.wallet, color: "border-purple-200" },
                ]).map(m => (
                  <div key={m.key} className={`rounded-lg border-2 p-3 text-center ${m.color}`}>
                    <p className="text-sm mb-1">{m.label}</p>
                    <p className="text-xl font-bold">Rs. {m.amount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(paymentMap.cash + paymentMap.bank + paymentMap.wallet) > 0
                        ? ((m.amount / (paymentMap.cash + paymentMap.bank + paymentMap.wallet)) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-sm font-medium">Total Received</span>
                <span className="text-xl font-bold text-primary">
                  Rs. {(paymentMap.cash + paymentMap.bank + paymentMap.wallet).toLocaleString()}
                </span>
              </div>

              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-sm font-medium">Total Pending (Unpaid)</span>
                <span className="text-xl font-bold text-destructive">Rs. {totalSalesRemaining.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Hidden printable content */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>{shop.shopName}</h1>
          <div className="meta">{shop.address} | {shop.phone}<br />{reportType.toUpperCase()} REPORT — {periodLabel}</div>

          {reportType === "sales" && (
            <>
              <div className="summary">
                <div className="summary-card"><div className="label">Total Sales</div><div className="value">Rs. {totalSalesAmt.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Paid</div><div className="value">Rs. {totalSalesPaid.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Pending</div><div className="value">Rs. {totalSalesRemaining.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Margin</div><div className="value">Rs. {totalMargin.toLocaleString()}</div></div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Remaining</th><th className="right">Margin</th></tr></thead>
                <tbody>
                  {filteredSales.map(s => {
                    const cost = s.items.reduce((a, i) => a + i.costPrice * i.quantity, 0);
                    return (
                      <tr key={s.localId}>
                        <td>{format(new Date(s.saleDate), "dd/MM/yy")}</td><td>{s.invoiceNumber}</td><td>{s.customerName}</td>
                        <td className="right bold">Rs. {s.totalAmount.toLocaleString()}</td>
                        <td className="right">Rs. {s.paidAmount.toLocaleString()}</td>
                        <td className="right">{s.remainingAmount > 0 ? `Rs. ${s.remainingAmount.toLocaleString()}` : "—"}</td>
                        <td className="right bold">Rs. {(s.totalAmount - cost).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 700, background: "#f5f5f5" }}>
                    <td colSpan={3}>Total ({filteredSales.length})</td>
                    <td className="right">Rs. {totalSalesAmt.toLocaleString()}</td>
                    <td className="right">Rs. {totalSalesPaid.toLocaleString()}</td>
                    <td className="right">Rs. {totalSalesRemaining.toLocaleString()}</td>
                    <td className="right">Rs. {totalMargin.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {reportType === "purchases" && (
            <>
              <div className="summary">
                <div className="summary-card"><div className="label">Total Purchases</div><div className="value">Rs. {totalPurchasesAmt.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Paid</div><div className="value">Rs. {totalPurchasesPaid.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Pending</div><div className="value">Rs. {(totalPurchasesAmt - totalPurchasesPaid).toLocaleString()}</div></div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Supplier</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Pending</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredPurchases.map(p => (
                    <tr key={p.localId}>
                      <td>{format(new Date(p.purchaseDate), "dd/MM/yy")}</td><td>{p.supplierName}</td>
                      <td className="right bold">Rs. {p.totalAmount.toLocaleString()}</td>
                      <td className="right">Rs. {p.paidAmount.toLocaleString()}</td>
                      <td className="right">Rs. {(p.totalAmount - p.paidAmount).toLocaleString()}</td>
                      <td>{p.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {reportType === "items" && (
            <>
              <h2>Item Wise Sales</h2>
              <table>
                <thead><tr><th>#</th><th>Product</th><th className="right">Qty</th><th className="right">Revenue</th><th className="right">Cost</th><th className="right">Margin</th></tr></thead>
                <tbody>
                  {itemRows.map((r, i) => (
                    <tr key={i}><td>{i+1}</td><td>{r.name}</td><td className="right">{r.qty}</td><td className="right">Rs. {r.revenue.toLocaleString()}</td><td className="right">Rs. {r.cost.toLocaleString()}</td><td className="right bold">Rs. {r.margin.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
              <h2>Item Wise Purchases</h2>
              <table>
                <thead><tr><th>#</th><th>Product</th><th className="right">Qty</th><th className="right">Total</th></tr></thead>
                <tbody>
                  {purchaseItemRows.map((r, i) => (
                    <tr key={i}><td>{i+1}</td><td>{r.name}</td><td className="right">{r.qty}</td><td className="right bold">Rs. {r.total.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {reportType === "margin" && (
            <>
              <div className="summary">
                <div className="summary-card"><div className="label">Revenue</div><div className="value">Rs. {totalSalesAmt.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Cost</div><div className="value">Rs. {totalCost.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Gross Margin</div><div className="value">Rs. {totalMargin.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Net Profit</div><div className="value">Rs. {Math.abs(netProfit).toLocaleString()}</div></div>
              </div>
              <h2>Top Profitable Items</h2>
              <table>
                <thead><tr><th>Product</th><th className="right">Revenue</th><th className="right">Cost</th><th className="right">Margin</th><th className="right">%</th></tr></thead>
                <tbody>
                  {itemRows.slice(0, 10).map((r, i) => (
                    <tr key={i}><td>{r.name}</td><td className="right">Rs. {r.revenue.toLocaleString()}</td><td className="right">Rs. {r.cost.toLocaleString()}</td><td className="right bold">Rs. {r.margin.toLocaleString()}</td><td className="right">{r.revenue > 0 ? ((r.margin/r.revenue)*100).toFixed(1) : 0}%</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {reportType === "payment" && (
            <>
              <div className="summary">
                <div className="summary-card"><div className="label">Cash</div><div className="value">Rs. {paymentMap.cash.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Bank</div><div className="value">Rs. {paymentMap.bank.toLocaleString()}</div></div>
                <div className="summary-card"><div className="label">Wallet</div><div className="value">Rs. {paymentMap.wallet.toLocaleString()}</div></div>
              </div>
              <p style={{ margin: "3mm 0", fontSize: "12px" }}>
                <strong>Total Received:</strong> Rs. {(paymentMap.cash + paymentMap.bank + paymentMap.wallet).toLocaleString()}<br />
                <strong>Total Pending:</strong> Rs. {totalSalesRemaining.toLocaleString()}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
