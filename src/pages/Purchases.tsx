import { useEffect, useState, useCallback } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Trash2, Wifi, WifiOff, ShoppingCart, Eye, Undo2,
} from "lucide-react";
import {
  getAllPurchases, addPurchase, deletePurchase, addPurchaseReturn,
  startPurchaseAutoSync, Purchase, PurchaseItem,
} from "@/lib/offlinePurchaseService";
import { getAllProducts, Product } from "@/lib/offlineProductService";
import { getAllSuppliers, Supplier } from "@/lib/offlineSupplierService";
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
  const [itemIMEIs, setItemIMEIs] = useState("");

  // View & Return
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
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

  const handleProductSelect = (productLocalId: string) => {
    const p = products.find(pr => pr.localId === productLocalId);
    if (p) {
      setSelectedProduct(productLocalId);
      setItemCost(p.costPrice);
      setItemSale(p.salePrice);
    }
  };

  const handleAddItem = () => {
    const p = products.find(pr => pr.localId === selectedProduct);
    if (!p) return;
    const imeis = itemIMEIs.split("\n").map(s => s.trim()).filter(Boolean);
    if (p.isMobile && imeis.length !== itemQty) {
      toast({ title: "IMEI Required", description: `Enter exactly ${itemQty} IMEI numbers for mobile products.`, variant: "destructive" });
      return;
    }
    setItems(prev => [...prev, {
      productLocalId: p.localId, productName: p.productName,
      quantity: itemQty, unitType: itemUnit, costPrice: itemCost, salePrice: itemSale,
      total: itemCost * itemQty, imeiNumbers: imeis,
    }]);
    setAddItemOpen(false);
    setSelectedProduct(""); setItemQty(1); setItemCost(0); setItemSale(0); setItemIMEIs("");
  };

  const totalAmount = items.reduce((s, i) => s + i.total, 0);

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
      await addPurchase({
        supplierLocalId: supplier.localId, supplierName: supplier.name, supplierId: supplier.id,
        items, totalAmount, paidAmount, paymentStatus: payStatus, purchaseDate,
      });
      toast({ title: "Purchase Saved" });
      setItems([]); setSelectedSupplier(""); setPaidAmount(0); setTab("list");
      await load();
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="rounded-lg bg-destructive/10 p-3"><Receipt className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Payments</p>
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
                          <TableCell>
                            <Badge variant={p.paymentStatus === "paid" ? "default" : p.paymentStatus === "partial" ? "secondary" : "destructive"} className="text-xs">
                              {p.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
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
            <CardHeader><CardTitle className="text-base">Purchase Details</CardTitle></CardHeader>
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
                        <TableCell className="text-right font-mono">Rs. {item.total.toLocaleString()}</TableCell>
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

          {/* Payment */}
          {items.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>Rs. {totalAmount.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  <Label>Paid Amount</Label>
                  <Input type="number" placeholder="0" value={paidAmount || ""} onChange={e => setPaidAmount(Number(e.target.value))} />
                </div>
                <Button className="w-full" onClick={handleSavePurchase} disabled={saving}>
                  {saving ? "Saving..." : "Save Purchase"}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Purchase Item</DialogTitle></DialogHeader>
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={itemQty} onChange={e => setItemQty(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Unit Type</Label>
                <Select value={itemUnit} onValueChange={v => setItemUnit(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
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
            {/* IMEI for mobile */}
            {products.find(p => p.localId === selectedProduct)?.isMobile && (
              <div className="space-y-2">
                <Label>IMEI Numbers (one per line) *</Label>
                <Textarea
                  placeholder={`Enter ${itemQty} IMEI number(s), one per line`}
                  value={itemIMEIs}
                  onChange={e => setItemIMEIs(e.target.value)}
                  rows={Math.max(3, itemQty)}
                />
                <p className="text-xs text-muted-foreground">
                  {itemIMEIs.split("\n").filter(Boolean).length} / {itemQty} entered
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!selectedProduct}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Purchase Dialog */}
      <Dialog open={!!viewPurchase} onOpenChange={open => { if (!open) setViewPurchase(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {viewPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {format(new Date(viewPurchase.purchaseDate), "dd/MM/yyyy")}</div>
                <div><span className="text-muted-foreground">Supplier:</span> {viewPurchase.supplierName}</div>
                <div><span className="text-muted-foreground">Total:</span> Rs. {viewPurchase.totalAmount.toLocaleString()}</div>
                <div><span className="text-muted-foreground">Paid:</span> Rs. {viewPurchase.paidAmount.toLocaleString()}</div>
              </div>
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
                          <p className="text-xs text-muted-foreground mt-0.5">{item.imeiNumbers.join(", ")}</p>
                        )}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
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
            <p className="text-sm font-medium">Return Amount: Rs. {((returnItem?.costPrice || 0) * returnQty).toLocaleString()}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReturn}>Process Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;
