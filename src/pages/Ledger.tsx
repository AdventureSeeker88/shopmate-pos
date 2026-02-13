import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Search, Users, Truck, ArrowUpRight, ArrowDownRight, BookOpen, Wifi, WifiOff } from "lucide-react";
import { getAllCustomers, getCustomerLedger, Customer, CustomerLedgerEntry } from "@/lib/offlineCustomerService";
import { getAllSuppliers, getSupplierLedger, Supplier, SupplierLedgerEntry } from "@/lib/offlineSupplierService";
import { format, isToday } from "date-fns";

const Ledger = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [custLedgers, setCustLedgers] = useState<Record<string, CustomerLedgerEntry[]>>({});
  const [suppLedgers, setSuppLedgers] = useState<Record<string, SupplierLedgerEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("customers");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [custs, supps] = await Promise.all([getAllCustomers(), getAllSuppliers()]);
      setCustomers(custs);
      setSuppliers(supps);

      const cl: Record<string, CustomerLedgerEntry[]> = {};
      for (const c of custs) { cl[c.localId] = await getCustomerLedger(c.localId); }
      setCustLedgers(cl);

      const sl: Record<string, SupplierLedgerEntry[]> = {};
      for (const s of supps) { sl[s.localId] = await getSupplierLedger(s.localId); }
      setSuppLedgers(sl);
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

  const q = search.toLowerCase();
  const filteredCustomers = customers.filter(c => c.status === "active" && (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)));
  const filteredSuppliers = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || s.phone.includes(q));

  const todayCustEntries = Object.values(custLedgers).flat().filter(e => isToday(new Date(e.date)));
  const todaySuppEntries = Object.values(suppLedgers).flat().filter(e => isToday(new Date(e.date)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ledger</h1>
          <p className="text-sm text-muted-foreground">Customer & Supplier transaction history</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "destructive"} className="gap-1 text-xs">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          <Badge variant="outline" className="gap-1"><BookOpen className="h-3 w-3" /> {format(new Date(), "dd MMM yyyy")}</Badge>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50"><Users className="h-4 w-4 text-blue-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Customer Txns Today</p>
              <p className="text-lg font-bold">{todayCustEntries.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50"><ArrowDownRight className="h-4 w-4 text-emerald-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Received Today</p>
              <p className="text-lg font-bold">Rs. {todayCustEntries.filter(e => e.type === "payment").reduce((a, e) => a + e.amount, 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-50"><Truck className="h-4 w-4 text-orange-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Supplier Txns Today</p>
              <p className="text-lg font-bold">{todaySuppEntries.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50"><ArrowUpRight className="h-4 w-4 text-red-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Paid Today</p>
              <p className="text-lg font-bold">Rs. {todaySuppEntries.filter(e => e.type === "payment").reduce((a, e) => a + e.amount, 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="customers">Customers ({filteredCustomers.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({filteredSuppliers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-3 space-y-3">
          {loading ? <div className="text-center py-6 text-sm text-muted-foreground">Loading...</div> :
            filteredCustomers.map(c => {
              const entries = custLedgers[c.localId] || [];
              if (entries.length === 0) return null;
              let running = c.openingBalance;
              return (
                <Card key={c.localId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{c.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <Badge variant={c.balanceType === "payable" ? "destructive" : "default"} className="text-xs">
                        Rs. {c.currentBalance.toLocaleString()} {c.balanceType}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Date</TableHead>
                          <TableHead className="text-[10px]">Type</TableHead>
                          <TableHead className="text-[10px]">Description</TableHead>
                          <TableHead className="text-[10px] text-right">Debit</TableHead>
                          <TableHead className="text-[10px] text-right">Credit</TableHead>
                          <TableHead className="text-[10px] text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map(e => {
                          const isDebit = e.type === "sale";
                          if (isDebit) running += e.amount;
                          else running -= e.amount;
                          return (
                            <TableRow key={e.localId}>
                              <TableCell className="text-[10px]">{format(new Date(e.date), "dd/MM/yy")}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[9px] capitalize">{e.type.replace("_", " ")}</Badge></TableCell>
                              <TableCell className="text-[10px] max-w-[200px] truncate">{e.description}</TableCell>
                              <TableCell className="text-[10px] text-right font-medium text-destructive">{isDebit ? `Rs. ${e.amount.toLocaleString()}` : ""}</TableCell>
                              <TableCell className="text-[10px] text-right font-medium text-emerald-600">{!isDebit ? `Rs. ${e.amount.toLocaleString()}` : ""}</TableCell>
                              <TableCell className="text-[10px] text-right font-bold">Rs. {Math.abs(running).toLocaleString()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })
          }
        </TabsContent>

        <TabsContent value="suppliers" className="mt-3 space-y-3">
          {loading ? <div className="text-center py-6 text-sm text-muted-foreground">Loading...</div> :
            filteredSuppliers.map(s => {
              const entries = suppLedgers[s.localId] || [];
              if (entries.length === 0) return null;
              let running = s.openingBalance;
              return (
                <Card key={s.localId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{s.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{s.phone}</p>
                      </div>
                      <Badge variant={s.balanceType === "payable" ? "destructive" : "default"} className="text-xs">
                        Rs. {s.currentBalance.toLocaleString()} {s.balanceType}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Date</TableHead>
                          <TableHead className="text-[10px]">Type</TableHead>
                          <TableHead className="text-[10px]">Description</TableHead>
                          <TableHead className="text-[10px] text-right">Debit</TableHead>
                          <TableHead className="text-[10px] text-right">Credit</TableHead>
                          <TableHead className="text-[10px] text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map(e => {
                          const isDebit = e.type === "purchase";
                          if (isDebit) running += e.amount;
                          else running -= e.amount;
                          return (
                            <TableRow key={e.localId}>
                              <TableCell className="text-[10px]">{format(new Date(e.date), "dd/MM/yy")}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[9px] capitalize">{e.type}</Badge></TableCell>
                              <TableCell className="text-[10px] max-w-[200px] truncate">{e.description}</TableCell>
                              <TableCell className="text-[10px] text-right font-medium text-destructive">{isDebit ? `Rs. ${e.amount.toLocaleString()}` : ""}</TableCell>
                              <TableCell className="text-[10px] text-right font-medium text-emerald-600">{!isDebit ? `Rs. ${e.amount.toLocaleString()}` : ""}</TableCell>
                              <TableCell className="text-[10px] text-right font-bold">Rs. {Math.abs(running).toLocaleString()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })
          }
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Ledger;
