import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Receipt, BarChart3 } from "lucide-react";
import { getAllPurchases, Purchase } from "@/lib/offlinePurchaseService";
import { getAllSales, Sale } from "@/lib/offlineSaleService";
import PurchaseInvoice from "@/components/purchases/PurchaseInvoice";
import SaleInvoice from "@/components/sales/SaleInvoice";
import { format } from "date-fns";

const Invoices = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [printPurchase, setPrintPurchase] = useState<Purchase | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([getAllPurchases(), getAllSales()]);
      setPurchases(p);
      setSales(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Invoice History</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><Receipt className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Purchase Invoices</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : purchases.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Sale Invoices</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : sales.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sales"><BarChart3 className="h-4 w-4 mr-1.5" /> Sale Invoices</TabsTrigger>
          <TabsTrigger value="purchases"><Receipt className="h-4 w-4 mr-1.5" /> Purchase Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Print</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map(s => (
                        <TableRow key={s.localId}>
                          <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                          <TableCell>{format(new Date(s.saleDate), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{s.customerName}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {s.totalAmount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={s.paymentStatus === "paid" ? "default" : "destructive"} className="text-xs">{s.paymentStatus}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setPrintSale(s)}><Printer className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {sales.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No sale invoices</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="purchases" className="mt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Print</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map(p => (
                        <TableRow key={p.localId}>
                          <TableCell className="font-mono text-xs">{p.localId.slice(-8).toUpperCase()}</TableCell>
                          <TableCell>{format(new Date(p.purchaseDate), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{p.supplierName}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {p.totalAmount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={p.paymentStatus === "paid" ? "default" : "destructive"} className="text-xs">{p.paymentStatus}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setPrintPurchase(p)}><Printer className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {purchases.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No purchase invoices</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PurchaseInvoice open={!!printPurchase} onOpenChange={open => { if (!open) setPrintPurchase(null); }} purchase={printPurchase} />
      <SaleInvoice open={!!printSale} onOpenChange={open => { if (!open) setPrintSale(null); }} sale={printSale} />
    </div>
  );
};

export default Invoices;
