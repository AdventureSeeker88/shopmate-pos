import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Wallet, Banknote, CreditCard, Calendar, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { getAllSales, Sale } from "@/lib/offlineSaleService";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

type PaymentMethod = "cash" | "bank" | "wallet";
type Period = "daily" | "weekly" | "monthly";

const Payments = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [period, setPeriod] = useState<Period>("daily");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setSales(await getAllSales()); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const now = new Date();
  const getRange = (p: Period) => {
    if (p === "daily") return { start: startOfDay(now), end: endOfDay(now) };
    if (p === "weekly") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  };

  const range = getRange(period);
  const filteredSales = sales.filter(s => {
    const d = new Date(s.saleDate);
    if (!isWithinInterval(d, range)) return false;
    if (methodFilter !== "all") {
      const pm = (s as any).paymentMethod;
      if (pm && pm !== methodFilter) return false;
    }
    return s.paidAmount > 0;
  });

  const totalCash = filteredSales.filter(s => !(s as any).paymentMethod || (s as any).paymentMethod === "cash").reduce((a, s) => a + s.paidAmount, 0);
  const totalBank = filteredSales.filter(s => (s as any).paymentMethod === "bank").reduce((a, s) => a + s.paidAmount, 0);
  const totalWallet = filteredSales.filter(s => (s as any).paymentMethod === "wallet").reduce((a, s) => a + s.paidAmount, 0);
  const grandTotal = totalCash + totalBank + totalWallet;

  const methodCards = [
    { key: "cash" as const, label: "Cash", icon: Banknote, total: totalCash, color: "text-emerald-600", bg: "bg-emerald-50" },
    { key: "bank" as const, label: "Bank", icon: CreditCard, total: totalBank, color: "text-blue-600", bg: "bg-blue-50" },
    { key: "wallet" as const, label: "Wallet", icon: Wallet, total: totalWallet, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Track received payments by method & period</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "destructive"} className="gap-1 text-xs">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" /> {format(now, "dd MMM yyyy")}</Badge>
        </div>
      </div>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={v => setPeriod(v as Period)}>
        <TabsList className="grid w-full grid-cols-3 max-w-xs">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {methodCards.map(m => (
          <Card key={m.key} className={`cursor-pointer transition-all border-2 ${methodFilter === m.key ? "border-primary shadow-md" : "border-transparent hover:border-border"}`}
            onClick={() => setMethodFilter(methodFilter === m.key ? "all" : m.key)}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${m.bg}`}><m.icon className={`h-5 w-5 ${m.color}`} /></div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium">{m.label}</p>
                <p className="text-xl font-bold">Rs. {m.total.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grand Total */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Total Received ({period})</span>
          </div>
          <span className="text-xl font-bold text-primary">Rs. {grandTotal.toLocaleString()}</span>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Payment Transactions ({filteredSales.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : filteredSales.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No payments found for this period</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Invoice</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map(s => (
                  <TableRow key={s.localId}>
                    <TableCell className="text-xs">{format(new Date(s.saleDate), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell className="text-xs font-mono">{s.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{s.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {(s as any).paymentMethod || "cash"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold">Rs. {s.paidAmount.toLocaleString()}</TableCell>
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

export default Payments;
