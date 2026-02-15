import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Wifi, WifiOff, Eye, Printer, Trash2, Undo2, CreditCard, AlertCircle,
  Search, ScanBarcode, X,
} from "lucide-react";
import {
  getAllSales, deleteSale, addSaleReturn, getSaleReturns, getAllSaleReturns, startSaleAutoSync, Sale, SaleItem, SaleReturn,
} from "@/lib/offlineSaleService";
import SaleInvoice from "@/components/sales/SaleInvoice";
import { format } from "date-fns";

const Sales = () => {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  // IMEI search
  const [imeiQuery, setImeiQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  // Return
  const [allReturns, setAllReturns] = useState<SaleReturn[]>([]);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<SaleItem | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnIMEIs, setReturnIMEIs] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { 
      const [s, r] = await Promise.all([getAllSales(), getAllSaleReturns()]);
      setSales(s);
      setAllReturns(r);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    startSaleAutoSync();
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const handleDelete = async (s: Sale) => {
    if (!confirm("Delete this sale? Stock will be reversed.")) return;
    await deleteSale(s.localId);
    await load();
    toast({ title: "Sale Deleted" });
  };

  const handleReturn = async () => {
    if (!viewSale || !returnItem) return;
    const imeis = returnIMEIs.split("\n").map(s => s.trim()).filter(Boolean);
    try {
      await addSaleReturn({
        saleLocalId: viewSale.localId, saleId: viewSale.id,
        productLocalId: returnItem.productLocalId, productName: returnItem.productName,
        returnQuantity: returnQty, returnIMEIs: imeis,
        returnReason, returnDate: new Date().toISOString(),
        returnAmount: returnItem.salePrice * returnQty,
        costPrice: returnItem.costPrice,
        customerLocalId: viewSale.customerLocalId, customerId: viewSale.customerId,
      });
      toast({ title: "Return Processed" });
      setReturnOpen(false); setReturnItem(null); setReturnQty(1); setReturnIMEIs(""); setReturnReason("");
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // IMEI filter
  const filteredSales = imeiQuery.trim()
    ? sales.filter(s => s.items.some(item => item.imeiNumbers?.some(imei => imei.toLowerCase().includes(imeiQuery.toLowerCase()))))
    : sales;

  const totalSales = filteredSales.reduce((s, sl) => s + sl.totalAmount, 0);
  const totalPaid = filteredSales.reduce((s, sl) => s + sl.paidAmount, 0);
  const totalPending = filteredSales.reduce((s, sl) => s + sl.remainingAmount, 0);

  const handleScanToggle = () => {
    setScanning(!scanning);
    if (!scanning) setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Sales</h1>
          <Badge variant={online ? "default" : "destructive"} className="mt-2 text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* IMEI Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={scanInputRef}
            placeholder={scanning ? "Scan barcode now..." : "Search by IMEI number..."}
            value={imeiQuery}
            onChange={(e) => setImeiQuery(e.target.value)}
            className={`pl-9 ${scanning ? "border-primary ring-2 ring-primary/20" : ""}`}
          />
          {imeiQuery && (
            <button onClick={() => setImeiQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Button variant={scanning ? "default" : "outline"} size="icon" onClick={handleScanToggle} title="Scan mode">
          <ScanBarcode className="h-4 w-4" />
        </Button>
        {imeiQuery && (
          <Badge variant="secondary" className="self-center text-xs">{filteredSales.length} result(s)</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : sales.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><CreditCard className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-foreground">Rs. {loading ? "—" : totalSales.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><CreditCard className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Received</p>
              <p className="text-2xl font-bold text-primary">Rs. {loading ? "—" : totalPaid.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-destructive/10 p-3"><AlertCircle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-destructive">Rs. {loading ? "—" : totalPending.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filteredSales.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="font-medium text-muted-foreground">No sales yet. Go to POS to make a sale.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Return</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map(s => (
                    <TableRow key={s.localId}>
                      <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                      <TableCell>{format(new Date(s.saleDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="font-medium">{s.customerName}</TableCell>
                      <TableCell className="text-right font-mono">Rs. {s.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">Rs. {s.paidAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {s.remainingAmount > 0 ? `Rs. ${s.remainingAmount.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.paymentStatus === "paid" ? "default" : s.paymentStatus === "partial" ? "secondary" : "destructive"} className="text-xs">
                          {s.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {allReturns.filter(r => r.saleLocalId === s.localId).length > 0 ? (
                          <Badge variant="destructive" className="text-[9px]">
                            {allReturns.filter(r => r.saleLocalId === s.localId).length} return(s)
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setPrintSale(s)} title="Print"><Printer className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewSale(s)} title="View"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Sale Dialog */}
      <Dialog open={!!viewSale} onOpenChange={open => { if (!open) setViewSale(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sale Details — {viewSale?.invoiceNumber}</DialogTitle></DialogHeader>
          {viewSale && (
            <ViewSaleContent sale={viewSale} onReturn={(item) => {
              setReturnItem(item);
              setReturnIMEIs(item.imeiNumbers?.join("\n") || "");
              setReturnQty(item.quantity);
              setReturnOpen(true);
            }} />
          )}
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnOpen} onOpenChange={open => { if (!open) { setReturnOpen(false); setReturnItem(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Return: {returnItem?.productName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Return Quantity</Label>
              <Input type="number" min={1} max={returnItem?.quantity || 1} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
            </div>
            {returnItem?.imeiNumbers && returnItem.imeiNumbers.length > 0 && (
              <div className="space-y-1">
                <Label>Return IMEIs (one per line)</Label>
                <Textarea placeholder="Enter IMEIs" value={returnIMEIs} onChange={e => setReturnIMEIs(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input placeholder="Return reason" value={returnReason} onChange={e => setReturnReason(e.target.value)} />
            </div>
            <div className="rounded bg-muted p-2 text-sm flex justify-between">
              <span>Return Amount</span>
              <span className="font-bold">Rs. {((returnItem?.salePrice || 0) * returnQty).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturnOpen(false); setReturnItem(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReturn}>Process Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice */}
      <SaleInvoice open={!!printSale} onOpenChange={open => { if (!open) setPrintSale(null); }} sale={printSale} />
    </div>
  );
};

// View Sale Content with return details
const ViewSaleContent = ({ sale, onReturn }: { sale: Sale; onReturn: (item: SaleItem) => void }) => {
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  useEffect(() => { getSaleReturns(sale.localId).then(setReturns); }, [sale.localId]);

  const totalMargin = sale.items.reduce((a, i) => a + (i.salePrice - i.costPrice) * i.quantity, 0);
  const returnMargin = returns.reduce((a, r) => a + (r.returnAmount - (r.costPrice || 0) * r.returnQuantity), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-2.5">
          <span className="text-muted-foreground text-xs">Customer</span>
          <p className="font-medium">{sale.customerName}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5">
          <span className="text-muted-foreground text-xs">Date</span>
          <p className="font-medium">{format(new Date(sale.saleDate), "dd/MM/yyyy HH:mm")}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5">
          <span className="text-muted-foreground text-xs">Total</span>
          <p className="font-medium">Rs. {sale.totalAmount.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5">
          <span className="text-muted-foreground text-xs">Paid</span>
          <p className="font-medium">Rs. {sale.paidAmount.toLocaleString()}</p>
        </div>
      </div>
      {sale.remainingAmount > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex justify-between items-center">
          <span className="text-sm text-destructive font-medium">Remaining</span>
          <span className="font-bold text-destructive">Rs. {sale.remainingAmount.toLocaleString()}</span>
        </div>
      )}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex justify-between items-center">
        <span className="text-sm text-primary font-medium">Margin</span>
        <span className="font-bold text-primary">Rs. {(totalMargin - returnMargin).toLocaleString()}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sale.items.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <p className="font-medium">{item.productName}</p>
                {(item.variationStorage || item.variationColor) && (
                  <p className="text-xs text-primary">{item.variationStorage} / {item.variationColor}</p>
                )}
                {item.imeiNumbers?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground font-mono">IMEI: {item.imeiNumbers.join(", ")}</p>
                )}
              </TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell className="text-right font-mono">Rs. {item.salePrice.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">Rs. {item.total.toLocaleString()}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onReturn(item)}>
                  <Undo2 className="h-3 w-3 mr-1" /> Return
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Return History */}
      {returns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-destructive flex items-center gap-1">
            <Undo2 className="h-3 w-3" /> Returns ({returns.length})
          </h4>
          {returns.map(r => (
            <div key={r.localId} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">{r.productName}</span>
                <span className="font-bold text-destructive">-Rs. {r.returnAmount.toLocaleString()}</span>
              </div>
              <div className="flex gap-3 text-muted-foreground">
                <span>Qty: {r.returnQuantity}</span>
                <span>Margin Lost: Rs. {(r.returnAmount - (r.costPrice || 0) * r.returnQuantity).toLocaleString()}</span>
                <span>{format(new Date(r.returnDate), "dd/MM/yy")}</span>
              </div>
              {r.returnReason && <p className="text-muted-foreground">Reason: {r.returnReason}</p>}
              {r.returnIMEIs?.length > 0 && <p className="font-mono text-muted-foreground">IMEIs: {r.returnIMEIs.join(", ")}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sales;
