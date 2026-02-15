import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart, Package, CreditCard, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, ArrowUpRight, ArrowDownRight, Wifi, WifiOff,
  Search, ScanBarcode, X, Eye, User, Phone, MapPin, FileText,
} from "lucide-react";
import { getAllSales, getAllSaleReturns, Sale, SaleReturn } from "@/lib/offlineSaleService";
import { getAllPurchases, getAllPurchaseReturns, Purchase, PurchaseReturn } from "@/lib/offlinePurchaseService";
import { getAllExpenses, Expense } from "@/lib/offlineExpenseService";
import { getAllProducts, Product } from "@/lib/offlineProductService";
import { getAllCustomers, Customer } from "@/lib/offlineCustomerService";
import { format, isToday, isThisWeek, isThisMonth, startOfDay } from "date-fns";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const Dashboard = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [imeiQuery, setImeiQuery] = useState("");
  const [imeiResults, setImeiResults] = useState<{ type: "sale" | "purchase"; record: Sale | Purchase; item: any; imei: string }[]>([]);
  const [selectedImeiResult, setSelectedImeiResult] = useState<{ type: "sale" | "purchase"; record: Sale | Purchase; item: any; imei: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [s, p, e, pr, cu, sr, pret] = await Promise.all([
      getAllSales(), getAllPurchases(), getAllExpenses(), getAllProducts(), getAllCustomers(),
      getAllSaleReturns(), getAllPurchaseReturns(),
    ]);
    setSales(s); setPurchases(p); setExpenses(e); setProducts(pr); setCustomers(cu);
    setSaleReturns(sr); setPurchaseReturns(pret);
  };

  useEffect(() => {
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const todaySales = sales.filter(s => isToday(new Date(s.saleDate)));
  const weekSales = sales.filter(s => isThisWeek(new Date(s.saleDate)));
  const monthSales = sales.filter(s => isThisMonth(new Date(s.saleDate)));

  const todayRevenue = todaySales.reduce((a, s) => a + s.totalAmount, 0);
  const weekRevenue = weekSales.reduce((a, s) => a + s.totalAmount, 0);
  const monthRevenue = monthSales.reduce((a, s) => a + s.totalAmount, 0);

  const todayCost = todaySales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.costPrice * i.quantity, 0), 0);
  const todaySaleReturnAmt = saleReturns.filter(r => isToday(new Date(r.returnDate))).reduce((a, r) => a + r.returnAmount, 0);
  const todaySaleReturnCost = saleReturns.filter(r => isToday(new Date(r.returnDate))).reduce((a, r) => a + (r.costPrice || 0) * r.returnQuantity, 0);
  const todayProfit = (todayRevenue - todaySaleReturnAmt) - (todayCost - todaySaleReturnCost);

  const totalPurchases = purchases.reduce((a, p) => a + p.totalAmount, 0);
  const totalPurchaseReturnAmt = purchaseReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalSalesAmount = sales.reduce((a, s) => a + s.totalAmount, 0);
  const totalSaleReturnAmt = saleReturns.reduce((a, r) => a + r.returnAmount, 0);
  const totalSaleReturnCost = saleReturns.reduce((a, r) => a + (r.costPrice || 0) * r.returnQuantity, 0);
  const totalCost = sales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.costPrice * i.quantity, 0), 0);
  const grossProfit = (totalSalesAmount - totalSaleReturnAmt) - (totalCost - totalSaleReturnCost);
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const netProfit = grossProfit - totalExpenses;

  const pendingReceivable = sales.filter(s => s.paymentStatus !== "paid").reduce((a, s) => a + s.remainingAmount, 0);
  const pendingPayable = purchases.filter(p => p.paymentStatus !== "paid").reduce((a, p) => a + (p.totalAmount - p.paidAmount), 0);

  const totalStock = products.reduce((a, p) => a + p.currentStock, 0);
  const lowStockProducts = products.filter(p => p.currentStock <= p.stockAlertQty && p.stockAlertQty > 0);

  // Last 7 days chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const day = startOfDay(d);
    const daySales = sales.filter(s => format(new Date(s.saleDate), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
    const dayExpenses = expenses.filter(e => e.date === format(day, "yyyy-MM-dd"));
    return {
      day: format(day, "EEE"),
      sales: daySales.reduce((a, s) => a + s.totalAmount, 0),
      expenses: dayExpenses.reduce((a, e) => a + e.amount, 0),
    };
  });

  const paymentBreakdown = [
    { name: "Received", value: sales.reduce((a, s) => a + s.paidAmount, 0), color: "hsl(var(--chart-1))" },
    { name: "Pending", value: pendingReceivable, color: "hsl(var(--chart-2))" },
  ].filter(d => d.value > 0);

  const fmt = (n: number) => `₨ ${n.toLocaleString()}`;

  const recentSales = [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  // IMEI Search
  const searchIMEI = (q: string) => {
    if (!q.trim()) { setImeiResults([]); return; }
    const lower = q.toLowerCase();
    const results: typeof imeiResults = [];

    sales.forEach(s => {
      s.items.forEach(item => {
        item.imeiNumbers?.forEach(imei => {
          if (imei.toLowerCase().includes(lower)) {
            results.push({ type: "sale", record: s, item, imei });
          }
        });
      });
    });

    purchases.forEach(p => {
      p.items.forEach(item => {
        item.imeiNumbers?.forEach(imei => {
          if (imei.toLowerCase().includes(lower)) {
            results.push({ type: "purchase", record: p, item, imei });
          }
        });
      });
    });

    setImeiResults(results);
  };

  const handleScanToggle = () => {
    setScanning(!scanning);
    if (!scanning) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  };

  const handleScanInput = (val: string) => {
    setImeiQuery(val);
    searchIMEI(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome back — here's your business overview</p>
        </div>
        <Badge variant={online ? "default" : "destructive"} className="gap-1">
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "Online" : "Offline"}
        </Badge>
      </div>

      {/* IMEI Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> IMEI Search & History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={scanInputRef}
                placeholder={scanning ? "Scan barcode now..." : "Search IMEI number..."}
                value={imeiQuery}
                onChange={(e) => handleScanInput(e.target.value)}
                className={`pl-9 ${scanning ? "border-primary ring-2 ring-primary/20" : ""}`}
                onKeyDown={(e) => { if (e.key === "Enter") searchIMEI(imeiQuery); }}
              />
              {imeiQuery && (
                <button onClick={() => { setImeiQuery(""); setImeiResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Button variant={scanning ? "default" : "outline"} size="icon" onClick={handleScanToggle} title="Toggle barcode scan mode">
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>

          {scanning && (
            <p className="text-xs text-primary animate-pulse">📡 Scan mode active — scan a barcode or type IMEI digits</p>
          )}

          {imeiResults.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              <p className="text-xs text-muted-foreground font-medium">{imeiResults.length} result(s) found</p>
              {imeiResults.map((r, i) => {
                const isSale = r.type === "sale";
                const rec = r.record as any;
                const cust = isSale ? customers.find(c => c.localId === rec.customerLocalId || c.id === rec.customerId) : null;
                return (
                  <div key={i} className="rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setSelectedImeiResult(r)}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant={isSale ? "default" : "secondary"} className="text-xs">{isSale ? "SALE" : "PURCHASE"}</Badge>
                          <span className="font-mono text-sm font-medium">{r.imei}</span>
                        </div>
                        <p className="text-sm font-medium">{r.item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {isSale ? `Customer: ${rec.customerName || "Walk-in"}` : `Supplier: ${rec.supplierName}`}
                          {" • "}{format(new Date(isSale ? rec.saleDate : rec.purchaseDate), "dd MMM yyyy")}
                          {" • "}{rec.invoiceNumber || "—"}
                        </p>
                        {cust && (
                          <p className="text-xs text-muted-foreground">
                            📱 {cust.phone} {cust.cnic ? `• CNIC: ${cust.cnic}` : ""} {cust.address ? `• ${cust.address}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">₨ {r.item.total?.toLocaleString()}</p>
                        <Eye className="h-3 w-3 text-muted-foreground ml-auto mt-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {imeiQuery && imeiResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No records found for "{imeiQuery}"</p>
          )}
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Sales</CardTitle>
            <div className="rounded-full bg-green-500/10 p-2"><ShoppingCart className="h-4 w-4 text-green-600" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(todayRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{todaySales.length} transaction(s)</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Profit</CardTitle>
            <div className="rounded-full bg-blue-500/10 p-2"><TrendingUp className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${todayProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(todayProfit)}</p>
            <p className="text-xs text-muted-foreground mt-1">Revenue − Cost</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receivable</CardTitle>
            <div className="rounded-full bg-orange-500/10 p-2"><CreditCard className="h-4 w-4 text-orange-600" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{fmt(pendingReceivable)}</p>
            <p className="text-xs text-muted-foreground mt-1">Pending from customers</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock</CardTitle>
            <div className="rounded-full bg-purple-500/10 p-2"><Package className="h-4 w-4 text-purple-600" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalStock}</p>
            <p className="text-xs text-muted-foreground mt-1">{products.length} products</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="rounded-full bg-green-500/10 p-3"><ArrowUpRight className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Week Sales</p>
              <p className="text-xl font-bold">{fmt(weekRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="rounded-full bg-blue-500/10 p-3"><DollarSign className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Month Sales</p>
              <p className="text-xl font-bold">{fmt(monthRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="rounded-full bg-red-500/10 p-3"><ArrowDownRight className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Purchases</p>
              <p className="text-xl font-bold">{fmt(totalPurchases)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className={`rounded-full p-3 ${netProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <TrendingUp className={`h-5 w-5 ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net Profit</p>
              <p className={`text-xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(netProfit)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales vs Expenses Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales vs Expenses (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ sales: { label: "Sales", color: "hsl(var(--chart-1))" }, expenses: { label: "Expenses", color: "hsl(var(--chart-2))" } }} className="h-[250px] w-full">
              <BarChart data={last7Days}>
                <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₨${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sales" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Payment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {paymentBreakdown.length > 0 ? (
              <ChartContainer config={{ received: { label: "Received", color: "hsl(var(--chart-1))" }, pending: { label: "Pending", color: "hsl(var(--chart-2))" } }} className="h-[200px] w-full">
                <PieChart>
                  <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {paymentBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm">No sales data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet</p>
            ) : (
              <div className="space-y-3">
                {recentSales.map(s => (
                  <div key={s.localId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{s.customerName || "Walk-in"}</p>
                      <p className="text-xs text-muted-foreground">{s.invoiceNumber} • {format(new Date(s.saleDate), "dd MMM yyyy")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{fmt(s.totalAmount)}</p>
                      <Badge variant={s.paymentStatus === "paid" ? "default" : "destructive"} className="text-xs">
                        {s.paymentStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products are well stocked</p>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 6).map(p => (
                  <div key={p.localId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{p.productName}</p>
                      <p className="text-xs text-muted-foreground">{p.categoryName}</p>
                    </div>
                    <Badge variant="destructive">{p.currentStock} left</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* IMEI Detail Dialog */}
      <Dialog open={!!selectedImeiResult} onOpenChange={open => { if (!open) setSelectedImeiResult(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> IMEI Detail
            </DialogTitle>
          </DialogHeader>
          {selectedImeiResult && (() => {
            const isSale = selectedImeiResult.type === "sale";
            const rec = selectedImeiResult.record as any;
            const cust = isSale ? customers.find(c => c.localId === rec.customerLocalId || c.id === rec.customerId) : null;
            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={isSale ? "default" : "secondary"}>{isSale ? "SALE" : "PURCHASE"}</Badge>
                    <span className="font-mono text-lg font-bold">{selectedImeiResult.imei}</span>
                  </div>
                  <p className="text-sm font-medium">{selectedImeiResult.item.productName}</p>
                  {(selectedImeiResult.item.variationStorage || selectedImeiResult.item.variationColor) && (
                    <p className="text-xs text-primary">{selectedImeiResult.item.variationStorage} / {selectedImeiResult.item.variationColor}</p>
                  )}
                </div>

                <Separator />

                {/* Invoice Details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Invoice Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-xs text-muted-foreground">Invoice #</span>
                      <p className="font-mono font-medium">{rec.invoiceNumber || "—"}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-xs text-muted-foreground">Date</span>
                      <p className="font-medium">{format(new Date(isSale ? rec.saleDate : rec.purchaseDate), "dd MMM yyyy HH:mm")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-xs text-muted-foreground">Sale Price</span>
                      <p className="font-medium">₨ {selectedImeiResult.item.salePrice?.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <p className="font-medium">₨ {selectedImeiResult.item.total?.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-xs text-muted-foreground">Payment Status</span>
                      <Badge variant={rec.paymentStatus === "paid" ? "default" : "destructive"} className="mt-0.5">{rec.paymentStatus}</Badge>
                    </div>
                    {isSale && rec.remainingAmount > 0 && (
                      <div className="rounded-lg bg-destructive/10 p-2">
                        <span className="text-xs text-muted-foreground">Remaining</span>
                        <p className="font-bold text-destructive">₨ {rec.remainingAmount?.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer/Supplier Details */}
                {isSale ? (
                  <div className="space-y-2">
                    <Separator />
                    <h4 className="text-sm font-semibold flex items-center gap-1"><User className="h-3.5 w-3.5" /> Customer Details</h4>
                    {cust ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-xs text-muted-foreground">Name</span>
                          <p className="font-medium">{cust.name}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</span>
                          <p className="font-medium">{cust.phone}</p>
                        </div>
                        {cust.cnic && (
                          <div className="rounded-lg bg-muted/50 p-2">
                            <span className="text-xs text-muted-foreground">CNIC</span>
                            <p className="font-medium">{cust.cnic}</p>
                          </div>
                        )}
                        {cust.address && (
                          <div className="rounded-lg bg-muted/50 p-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</span>
                            <p className="font-medium">{cust.address}</p>
                          </div>
                        )}
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-xs text-muted-foreground">Current Balance</span>
                          <p className="font-medium">₨ {cust.currentBalance?.toLocaleString() || 0}</p>
                          <Badge variant={cust.balanceType === "payable" ? "destructive" : "default"} className="text-xs mt-0.5">{cust.balanceType}</Badge>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-xs text-muted-foreground">Customer ID</span>
                          <p className="font-mono text-xs">{cust.customerId}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{rec.customerName || "Walk-in Customer"} — {rec.customerPhone || "No phone"}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Separator />
                    <h4 className="text-sm font-semibold flex items-center gap-1"><User className="h-3.5 w-3.5" /> Supplier Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <span className="text-xs text-muted-foreground">Supplier</span>
                        <p className="font-medium">{rec.supplierName || "—"}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <span className="text-xs text-muted-foreground">Paid</span>
                        <p className="font-medium">₨ {rec.paidAmount?.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
