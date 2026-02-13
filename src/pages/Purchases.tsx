import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Trash2, Wifi, WifiOff, ShoppingCart, Eye, Undo2,
  ScanBarcode, Smartphone, Package, CreditCard, AlertCircle, Printer,
} from "lucide-react";
import {
  getAllPurchases, addPurchase, deletePurchase, addPurchaseReturn,
  startPurchaseAutoSync, Purchase, PurchaseItem,
} from "@/lib/offlinePurchaseService";
import PurchaseInvoice from "@/components/purchases/PurchaseInvoice";
import { getAllProducts, Product, checkIMEIExists } from "@/lib/offlineProductService";
import { getAllSuppliers, Supplier, recalculateBalanceLocal } from "@/lib/offlineSupplierService";
import { format } from "date-fns";

const Purchases = () => {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [tab, setTab] = useState("list");

  // Add purchase form
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Add item dialog
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemUnit, setItemUnit] = useState<"box" | "new" | "used">("new");
  const [itemCost, setItemCost] = useState(0);
  const [itemSale, setItemSale] = useState(0);
  const [itemIMEIs, setItemIMEIs] = useState<string[]>([""]);
  const [imeiMode, setImeiMode] = useState<"manual" | "scan">("manual");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // View & Return & Print
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [printPurchase, setPrintPurchase] = useState<Purchase | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<PurchaseItem | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnIMEIs, setReturnIMEIs] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr, s] = await Promise.all([getAllPurchases(), getAllProducts(), getAllSuppliers()]);
      setPurchases(p);
      setProducts(pr);
      setSuppliers(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    startPurchaseAutoSync();
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const selectedProductData = products.find(p => p.localId === selectedProduct);
  const selectedSupplierData = suppliers.find(s => s.localId === selectedSupplier);

  const handleProductSelect = (productLocalId: string) => {
    const p = products.find(pr => pr.localId === productLocalId);
    if (p) {
      setSelectedProduct(productLocalId);
      setItemCost(p.costPrice);
      setItemSale(p.salePrice);
      setItemIMEIs([""]);
      setItemQty(1);
    }
  };

  // Update IMEI array size when qty changes
  const handleQtyChange = (qty: number) => {
    setItemQty(qty);
    if (selectedProductData?.isMobile) {
      const newIMEIs = Array.from({ length: qty }, (_, i) => itemIMEIs[i] || "");
      setItemIMEIs(newIMEIs);
    }
  };

  const handleIMEIChange = (index: number, value: string) => {
    const updated = [...itemIMEIs];
    updated[index] = value.trim();
    setItemIMEIs(updated);
  };

  // Scanner: auto-fill next empty IMEI field and move focus
  const handleScanInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      if (!val) return;
      const emptyIdx = itemIMEIs.findIndex(im => !im);
      if (emptyIdx >= 0) {
        handleIMEIChange(emptyIdx, val);
        (e.target as HTMLInputElement).value = "";
        toast({ title: `IMEI #${emptyIdx + 1} scanned`, description: val });
      } else {
        toast({ title: "All IMEIs filled", variant: "destructive" });
      }
    }
  };

  const handleAddItem = async () => {
    const p = products.find(pr => pr.localId === selectedProduct);
    if (!p) return;
    const imeis = p.isMobile ? itemIMEIs.filter(Boolean) : [];
    if (p.isMobile && imeis.length !== itemQty) {
      toast({ title: "IMEI Required", description: `Enter exactly ${itemQty} IMEI numbers for mobile products.`, variant: "destructive" });
      return;
    }
    // Check for duplicate IMEIs
    if (p.isMobile) {
      const uniqueIMEIs = new Set(imeis);
      if (uniqueIMEIs.size !== imeis.length) {
        toast({ title: "Duplicate IMEI", description: "Each IMEI must be unique.", variant: "destructive" });
        return;
      }
      for (const imei of imeis) {
        const exists = await checkIMEIExists(imei);
        if (exists) {
          toast({ title: "IMEI Exists", description: `IMEI ${imei} is already in stock.`, variant: "destructive" });
          return;
        }
      }
    }
    setItems(prev => [...prev, {
      productLocalId: p.localId, productName: p.productName,
      quantity: itemQty, unitType: itemUnit, costPrice: itemCost, salePrice: itemSale,
      total: itemCost * itemQty, imeiNumbers: imeis,
    }]);
    setAddItemOpen(false);
    setSelectedProduct(""); setItemQty(1); setItemCost(0); setItemSale(0); setItemIMEIs([""]); setImeiMode("manual");
  };

  const totalAmount = items.reduce((s, i) => s + i.total, 0);
  const pendingAmount = totalAmount - paidAmount;

  const handleSavePurchase = async () => {
    if (!selectedSupplier || items.length === 0) {
      toast({ title: "Error", description: "Select supplier and add items", variant: "destructive" });
      return;
    }
    const supplier = suppliers.find(s => s.localId === selectedSupplier);
    if (!supplier) return;
    setSaving(true);
    try {
      const payStatus = paidAmount >= totalAmount ? "paid" : paidAmount > 0 ? "partial" : "pending";
      const localId = await addPurchase({
        supplierLocalId: supplier.localId, supplierName: supplier.name, supplierId: supplier.id,
        items, totalAmount, paidAmount, paymentStatus: payStatus, purchaseDate,
      });
      // Recalculate supplier balance after purchase
      await recalculateBalanceLocal(supplier.localId);
      await load();
      // Show print option
      const savedPurchase: Purchase = {
        id: "", localId, supplierLocalId: supplier.localId, supplierName: supplier.name,
        supplierId: supplier.id, items: [...items], totalAmount, paidAmount,
        paymentStatus: payStatus, purchaseDate, createdAt: new Date().toISOString(), syncStatus: "pending",
      };
      setPrintPurchase(savedPurchase);
      toast({ title: "Purchase Saved", description: payStatus !== "paid" ? `Pending: Rs. ${pendingAmount.toLocaleString()} added to supplier payable` : "Fully paid" });
      setItems([]); setSelectedSupplier(""); setPaidAmount(0); setTab("list");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDeletePurchase = async (p: Purchase) => {
    if (!confirm("Delete this purchase? Stock will be reversed.")) return;
    await deletePurchase(p.localId);
    await load();
    toast({ title: "Purchase Deleted" });
  };

  const handleReturn = async () => {
    if (!viewPurchase || !returnItem) return;
    const imeis = returnIMEIs.split("\n").map(s => s.trim()).filter(Boolean);
    try {
      await addPurchaseReturn({
        purchaseLocalId: viewPurchase.localId, purchaseId: viewPurchase.id,
        productLocalId: returnItem.productLocalId, productName: returnItem.productName,
        returnQuantity: returnQty, returnIMEIs: imeis,
        returnReason, returnDate: new Date().toISOString(),
        returnAmount: returnItem.costPrice * returnQty,
      });
      toast({ title: "Return Processed" });
      setReturnOpen(false); setReturnItem(null); setReturnQty(1); setReturnIMEIs(""); setReturnReason("");
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Purchase Management</h1>
          <Badge variant={online ? "default" : "destructive"} className="mt-2 text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><Receipt className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Purchases</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : purchases.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><ShoppingCart className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-foreground">Rs. {loading ? "—" : purchases.reduce((s, p) => s + p.totalAmount, 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><CreditCard className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="text-2xl font-bold text-foreground">Rs. {loading ? "—" : purchases.reduce((s, p) => s + p.paidAmount, 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-destructive/10 p-3"><AlertCircle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : purchases.filter(p => p.paymentStatus !== "paid").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list"><Receipt className="h-4 w-4 mr-1.5" /> Purchases</TabsTrigger>
          <TabsTrigger value="add"><Plus className="h-4 w-4 mr-1.5" /> New Purchase</TabsTrigger>
        </TabsList>

        {/* List */}
        <TabsContent value="list" className="mt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : purchases.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                <p className="font-medium text-muted-foreground">No purchases yet</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("add")}>
                  <Plus className="h-4 w-4 mr-1" /> New Purchase
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map(p => (
                        <TableRow key={p.localId}>
                          <TableCell>{format(new Date(p.purchaseDate), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="font-medium">{p.supplierName}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {p.totalAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {p.paidAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {p.totalAmount - p.paidAmount > 0 ? `Rs. ${(p.totalAmount - p.paidAmount).toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.paymentStatus === "paid" ? "default" : p.paymentStatus === "partial" ? "secondary" : "destructive"} className="text-xs">
                              {p.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setPrintPurchase(p)} title="Print Invoice"><Printer className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setViewPurchase(p)}><Eye className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeletePurchase(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        </TabsContent>

        {/* Add Purchase */}
        <TabsContent value="add" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Purchase Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.localId} value={s.localId}>
                          {s.name} — Rs. {s.currentBalance.toLocaleString()} ({s.balanceType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purchase Date</Label>
                  <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                </div>
              </div>
              {/* Supplier balance info */}
              {selectedSupplierData && (
                <div className="rounded-lg border bg-muted/50 p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance</span>
                  <span className="font-bold text-foreground">
                    Rs. {selectedSupplierData.currentBalance.toLocaleString()}{" "}
                    <Badge variant={selectedSupplierData.balanceType === "payable" ? "destructive" : "default"} className="text-xs ml-1">
                      {selectedSupplierData.balanceType}
                    </Badge>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <Button size="sm" onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No items added yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Sale</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.productName}</p>
                            {item.imeiNumbers.length > 0 && (
                              <p className="text-xs text-muted-foreground">{item.imeiNumbers.length} IMEI(s)</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{item.unitType}</Badge></TableCell>
                        <TableCell className="text-right font-mono">Rs. {item.costPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">Rs. {item.salePrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-primary">
                          Rs. {((item.salePrice - item.costPrice) * item.quantity).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">Rs. {item.total.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Payment Summary */}
          {items.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-bold text-lg">Rs. {totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Total Margin</span>
                    <span className="font-bold text-lg text-primary">
                      Rs. {items.reduce((s, i) => s + (i.salePrice - i.costPrice) * i.quantity, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Paid Amount</Label>
                  <Input type="number" placeholder="0" value={paidAmount || ""} onChange={e => setPaidAmount(Number(e.target.value))} />
                </div>
                {/* Pending balance indicator */}
                {paidAmount < totalAmount && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium text-destructive">Pending Amount</span>
                    </div>
                    <span className="font-bold text-destructive">Rs. {pendingAmount.toLocaleString()}</span>
                  </div>
                )}
                {paidAmount < totalAmount && selectedSupplierData && (
                  <p className="text-xs text-muted-foreground">
                    Rs. {pendingAmount.toLocaleString()} will be added to {selectedSupplierData.name}'s payable balance
                  </p>
                )}
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Payment Status</span>
                  <Badge variant={paidAmount >= totalAmount ? "default" : paidAmount > 0 ? "secondary" : "destructive"}>
                    {paidAmount >= totalAmount ? "Paid" : paidAmount > 0 ? "Partial" : "Pending"}
                  </Badge>
                </div>
                <Button className="w-full" size="lg" onClick={handleSavePurchase} disabled={saving}>
                  {saving ? "Saving..." : "Save Purchase"}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Add Purchase Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={selectedProduct} onValueChange={handleProductSelect}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.localId} value={p.localId}>{p.productName} ({p.categoryName})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Mobile product details */}
            {selectedProductData?.isMobile && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Smartphone className="h-4 w-4" /> Mobile Details
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Brand</Label>
                    <p className="text-sm font-medium">{selectedProductData.brand || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    <p className="text-sm font-medium">{selectedProductData.model || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Storage</Label>
                    <p className="text-sm font-medium">{selectedProductData.storage || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Color</Label>
                    <p className="text-sm font-medium">{selectedProductData.color || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Badge variant="outline" className="text-xs">Stock: {selectedProductData.currentStock}</Badge>
                  <Badge variant="outline" className="text-xs">IMEI Tracking: ON</Badge>
                </div>
              </div>
            )}

            {/* Non-mobile product info */}
            {selectedProductData && !selectedProductData.isMobile && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Stock</span>
                <Badge variant="outline">{selectedProductData.currentStock} units</Badge>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={itemQty} onChange={e => handleQtyChange(Number(e.target.value) || 1)} />
              </div>
              <div className="space-y-2">
                <Label>Unit Type</Label>
                <Select value={itemUnit} onValueChange={v => setItemUnit(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="box">Box Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Margin</Label>
                <p className="text-sm font-bold text-primary pt-2">Rs. {((itemSale - itemCost) * itemQty).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cost Price</Label>
                <Input type="number" value={itemCost || ""} onChange={e => setItemCost(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Sale Price</Label>
                <Input type="number" value={itemSale || ""} onChange={e => setItemSale(Number(e.target.value))} />
              </div>
            </div>

            {/* IMEI Section for mobiles */}
            {selectedProductData?.isMobile && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <ScanBarcode className="h-4 w-4" /> IMEI Numbers ({itemIMEIs.filter(Boolean).length}/{itemQty})
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      type="button" size="sm" variant={imeiMode === "manual" ? "default" : "outline"}
                      onClick={() => setImeiMode("manual")}
                    >
                      Manual
                    </Button>
                    <Button
                      type="button" size="sm" variant={imeiMode === "scan" ? "default" : "outline"}
                      onClick={() => { setImeiMode("scan"); setTimeout(() => scanInputRef.current?.focus(), 100); }}
                    >
                      <ScanBarcode className="h-3 w-3 mr-1" /> Scan
                    </Button>
                  </div>
                </div>

                {imeiMode === "scan" && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Scan barcode or type IMEI and press Enter</p>
                    <Input
                      ref={scanInputRef}
                      placeholder="Scan or type IMEI here..."
                      onKeyDown={handleScanInput}
                      autoFocus
                    />
                  </div>
                )}

                {/* Individual IMEI fields */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {itemIMEIs.map((imei, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 text-right">{idx + 1}.</span>
                      <Input
                        placeholder={`IMEI #${idx + 1}`}
                        value={imei}
                        onChange={e => handleIMEIChange(idx, e.target.value)}
                        className={imei ? "border-primary/50" : ""}
                        disabled={imeiMode === "scan"}
                      />
                      {imei && <Badge variant="outline" className="text-xs shrink-0 text-primary">✓</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="rounded-lg bg-muted p-3 flex justify-between items-center">
              <span className="font-medium">Item Total</span>
              <span className="text-lg font-bold">Rs. {(itemCost * itemQty).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!selectedProduct}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Purchase Dialog */}
      <Dialog open={!!viewPurchase} onOpenChange={open => { if (!open) setViewPurchase(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {viewPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground text-xs">Date</span>
                  <p className="font-medium">{format(new Date(viewPurchase.purchaseDate), "dd/MM/yyyy")}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground text-xs">Supplier</span>
                  <p className="font-medium">{viewPurchase.supplierName}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground text-xs">Total</span>
                  <p className="font-medium">Rs. {viewPurchase.totalAmount.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground text-xs">Paid</span>
                  <p className="font-medium">Rs. {viewPurchase.paidAmount.toLocaleString()}</p>
                </div>
              </div>
              {viewPurchase.totalAmount - viewPurchase.paidAmount > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex justify-between items-center">
                  <span className="text-sm text-destructive font-medium">Pending Amount</span>
                  <span className="font-bold text-destructive">Rs. {(viewPurchase.totalAmount - viewPurchase.paidAmount).toLocaleString()}</span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewPurchase.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <p className="font-medium">{item.productName}</p>
                        {item.imeiNumbers.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.imeiNumbers.map((imei, i) => (
                              <p key={i} className="text-xs text-muted-foreground font-mono">IMEI {i + 1}: {imei}</p>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{item.quantity} <span className="text-xs text-muted-foreground">({item.unitType})</span></TableCell>
                      <TableCell className="text-right font-mono">Rs. {item.total.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { setReturnItem(item); setReturnOpen(true); }}>
                          <Undo2 className="h-3 w-3 mr-1" /> Return
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Purchase Return — {returnItem?.productName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Return Quantity (max {returnItem?.quantity})</Label>
              <Input type="number" min={1} max={returnItem?.quantity} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
            </div>
            {(returnItem?.imeiNumbers?.length || 0) > 0 && (
              <div className="space-y-2">
                <Label>Return IMEI Numbers (one per line)</Label>
                <Textarea value={returnIMEIs} onChange={e => setReturnIMEIs(e.target.value)} rows={3} />
                <p className="text-xs text-muted-foreground">
                  Available: {returnItem?.imeiNumbers.join(", ")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="wrong_model">Wrong Model</SelectItem>
                  <SelectItem value="dead_mobile">Dead Mobile</SelectItem>
                  <SelectItem value="extra_quantity">Extra Quantity</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 flex justify-between">
              <span className="text-sm font-medium">Return Amount</span>
              <span className="font-bold text-destructive">Rs. {((returnItem?.costPrice || 0) * returnQty).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReturn}>Process Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Invoice */}
      <PurchaseInvoice
        open={!!printPurchase}
        onOpenChange={open => { if (!open) setPrintPurchase(null); }}
        purchase={printPurchase}
      />
    </div>
  );
};

export default Purchases;
