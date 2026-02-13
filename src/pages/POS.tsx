import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart, Search, Plus, Trash2, Wifi, WifiOff,
  ScanBarcode, Users, CreditCard, Printer, X, AlertCircle,
} from "lucide-react";
import { getAllProducts, Product, checkIMEIExists, getIMEIsByProduct } from "@/lib/offlineProductService";
import { getAllCategories, Category } from "@/lib/offlineCategoryService";
import { getAllCustomers, addCustomer, Customer } from "@/lib/offlineCustomerService";
import { addSale, SaleItem, Sale } from "@/lib/offlineSaleService";
import SaleInvoice from "@/components/sales/SaleInvoice";

interface CartItem extends SaleItem {
  margin: number;
}

const POS = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");

  // Payment
  const [paidAmount, setPaidAmount] = useState(0);

  // IMEI scan
  const [imeiSearch, setImeiSearch] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  // Invoice
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);

  // Variation selection dialog
  const [variationProduct, setVariationProduct] = useState<Product | null>(null);
  const [selectedVarIdx, setSelectedVarIdx] = useState("");
  const [varSalePrice, setVarSalePrice] = useState(0);
  const [varQty, setVarQty] = useState(1);
  const [varIMEIs, setVarIMEIs] = useState<string[]>([""]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, cu] = await Promise.all([getAllProducts(), getAllCategories(), getAllCustomers()]);
      setProducts(p);
      setCategories(c);
      setCustomers(cu);
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

  const filteredProducts = products.filter(p => {
    if (p.currentStock <= 0) return false;
    if (selectedCategory !== "all" && p.categoryId !== selectedCategory) return false;
    if (searchQuery && !p.productName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleAddToCart = (p: Product) => {
    if (p.currentStock <= 0) {
      toast({ title: "Out of Stock", variant: "destructive" });
      return;
    }
    if (p.isMobile) {
      // Open variation/IMEI dialog
      setVariationProduct(p);
      setSelectedVarIdx(p.variations?.length > 0 ? "0" : "");
      setVarSalePrice(p.variations?.[0]?.salePrice || p.salePrice);
      setVarQty(1);
      setVarIMEIs([""]);
      return;
    }
    // Non-mobile: check if already in cart
    const existing = cart.find(c => c.productLocalId === p.localId);
    if (existing) {
      setCart(cart.map(c => c.productLocalId === p.localId
        ? { ...c, quantity: c.quantity + 1, total: c.salePrice * (c.quantity + 1), margin: (c.salePrice - c.costPrice) * (c.quantity + 1) }
        : c
      ));
    } else {
      setCart([...cart, {
        productLocalId: p.localId, productName: p.productName,
        quantity: 1, costPrice: p.costPrice, salePrice: p.salePrice,
        total: p.salePrice, imeiNumbers: [], margin: p.salePrice - p.costPrice,
      }]);
    }
  };

  const handleAddMobileToCart = async () => {
    if (!variationProduct) return;
    const p = variationProduct;
    const imeis = varIMEIs.filter(Boolean);
    if (p.imeiTracking && imeis.length !== varQty) {
      toast({ title: "IMEI Required", description: `Enter ${varQty} IMEI(s)`, variant: "destructive" });
      return;
    }
    // Check IMEI uniqueness
    for (const imei of imeis) {
      if (cart.some(c => c.imeiNumbers.includes(imei))) {
        toast({ title: "IMEI already in cart", variant: "destructive" });
        return;
      }
    }

    let varStorage = "";
    let varColor = "";
    let costPrice = p.costPrice;
    if (p.variations?.length > 0 && selectedVarIdx !== "") {
      const v = p.variations[Number(selectedVarIdx)];
      varStorage = v.storage;
      varColor = v.color;
      costPrice = v.costPrice;
    }

    setCart([...cart, {
      productLocalId: p.localId, productName: p.productName,
      quantity: varQty, costPrice, salePrice: varSalePrice,
      total: varSalePrice * varQty, imeiNumbers: imeis,
      variationStorage: varStorage, variationColor: varColor,
      margin: (varSalePrice - costPrice) * varQty,
    }]);
    setVariationProduct(null);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));

  const updateCartPrice = (idx: number, price: number) => {
    setCart(cart.map((c, i) => i === idx
      ? { ...c, salePrice: price, total: price * c.quantity, margin: (price - c.costPrice) * c.quantity }
      : c
    ));
  };

  const totalAmount = cart.reduce((s, c) => s + c.total, 0);
  const totalMargin = cart.reduce((s, c) => s + c.margin, 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const selectedCustomerData = customers.find(c => c.localId === selectedCustomer);

  const handleIMEIScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const imei = imeiSearch.trim();
    if (!imei) return;
    // Find product by IMEI
    for (const p of products) {
      if (!p.isMobile) continue;
      const imeis = await getIMEIsByProduct(p.localId);
      const found = imeis.find(r => r.imei === imei && r.status === "in_stock");
      if (found) {
        // Add to cart
        const v = p.variations?.[0];
        setCart(prev => [...prev, {
          productLocalId: p.localId, productName: p.productName,
          quantity: 1, costPrice: v?.costPrice || p.costPrice,
          salePrice: v?.salePrice || p.salePrice,
          total: v?.salePrice || p.salePrice,
          imeiNumbers: [imei],
          variationStorage: v?.storage || "", variationColor: v?.color || "",
          margin: (v?.salePrice || p.salePrice) - (v?.costPrice || p.costPrice),
        }]);
        setImeiSearch("");
        toast({ title: "IMEI Added", description: `${p.productName} - ${imei}` });
        return;
      }
    }
    toast({ title: "IMEI Not Found", description: "This IMEI is not in stock", variant: "destructive" });
    setImeiSearch("");
  };

  const handleAddNewCustomer = async () => {
    if (!newCustName.trim() || !newCustPhone.trim()) {
      toast({ title: "Error", description: "Name and phone required", variant: "destructive" });
      return;
    }
    const localId = await addCustomer({ name: newCustName, phone: newCustPhone, cnic: "", address: "", openingBalance: 0, balanceType: "payable" });
    const updated = await getAllCustomers();
    setCustomers(updated);
    setSelectedCustomer(localId);
    setAddCustomerOpen(false);
    setNewCustName(""); setNewCustPhone("");
    toast({ title: "Customer Added" });
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast({ title: "Cart Empty", variant: "destructive" });
      return;
    }
    const cust = customers.find(c => c.localId === selectedCustomer);
    setSaving(true);
    try {
      const payStatus = paidAmount >= totalAmount ? "paid" : paidAmount > 0 ? "partial" : "pending";
      const result = await addSale({
        customerLocalId: cust?.localId || "", customerName: cust?.name || "Walk-in Customer",
        customerId: cust?.id || "", customerPhone: cust?.phone || "",
        items: cart.map(({ margin, ...rest }) => rest),
        totalAmount, paidAmount, paymentStatus: payStatus, saleDate: new Date().toISOString(),
      });
      setPrintSale(result.sale);
      toast({ title: "Sale Completed!", description: `Invoice: ${result.invoiceNumber}` });
      setCart([]); setSelectedCustomer(""); setPaidAmount(0);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">POS</h1>
          <Badge variant={online ? "default" : "destructive"} className="text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Categories */}
        <div className="lg:col-span-2 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Categories</h3>
          <div className="flex lg:flex-col gap-1 flex-wrap">
            <Button size="sm" variant={selectedCategory === "all" ? "default" : "outline"} className="text-xs justify-start"
              onClick={() => setSelectedCategory("all")}>All</Button>
            {categories.map(c => (
              <Button key={c.localId} size="sm" variant={selectedCategory === c.localId ? "default" : "outline"}
                className="text-xs justify-start" onClick={() => setSelectedCategory(c.localId)}>
                {c.categoryName}
              </Button>
            ))}
          </div>
        </div>

        {/* Middle: Products */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={scanRef} placeholder="Scan IMEI..." className="pl-9" value={imeiSearch}
                onChange={e => setImeiSearch(e.target.value)} onKeyDown={handleIMEIScan} />
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredProducts.map(p => (
                <Card key={p.localId} className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleAddToCart(p)}>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm truncate">{p.productName}</p>
                    {p.isMobile && <p className="text-xs text-muted-foreground">{p.brand} {p.model}</p>}
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-bold text-primary">Rs. {p.salePrice.toLocaleString()}</span>
                      <Badge variant={p.currentStock <= p.stockAlertQty ? "destructive" : "secondary"} className="text-[10px]">
                        {p.currentStock}
                      </Badge>
                    </div>
                    {p.variations?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">{p.variations.length} variant(s)</p>
                    )}
                  </CardContent>
                </Card>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-3 text-center py-12 text-muted-foreground">
                  {loading ? "Loading..." : "No products found"}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Cart */}
        <div className="lg:col-span-5 space-y-3">
          {/* Customer */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1"><Users className="h-3 w-3" /> Customer</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAddCustomerOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> New
                </Button>
              </div>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Walk-in Customer" /></SelectTrigger>
                <SelectContent>
                  {customers.filter(c => c.status === "active").map(c => (
                    <SelectItem key={c.localId} value={c.localId}>
                      {c.name} — {c.phone} {c.currentBalance > 0 ? `(Rs.${c.currentBalance.toLocaleString()} ${c.balanceType})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomerData && selectedCustomerData.currentBalance > 0 && (
                <div className="text-xs flex justify-between bg-muted/50 rounded px-2 py-1">
                  <span>Previous Balance</span>
                  <span className="font-bold text-destructive">Rs. {selectedCustomerData.currentBalance.toLocaleString()} ({selectedCustomerData.balanceType})</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cart Items */}
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm flex items-center gap-1"><ShoppingCart className="h-4 w-4" /> Cart ({cart.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <ScrollArea className="max-h-[300px]">
                {cart.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No items in cart</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item, idx) => (
                      <div key={idx} className="rounded-lg border p-2 space-y-1">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.productName}</p>
                            {(item.variationStorage || item.variationColor) && (
                              <p className="text-[10px] text-primary">{item.variationStorage} / {item.variationColor}</p>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFromCart(idx)}>
                            <X className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Qty: {item.quantity}</span>
                          <span className="text-muted-foreground">Cost: Rs.{item.costPrice.toLocaleString()}</span>
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-muted-foreground">Price:</span>
                            <Input type="number" className="h-6 w-20 text-xs" value={item.salePrice}
                              onChange={e => updateCartPrice(idx, Number(e.target.value))} />
                          </div>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-primary">Margin: Rs.{item.margin.toLocaleString()}</span>
                          <span className="font-bold">Rs. {item.total.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Payment */}
          {cart.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-xl font-bold">Rs. {totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Margin</span>
                  <span className="font-bold text-primary">Rs. {totalMargin.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="space-y-1">
                  <Label className="text-xs">Paid Amount</Label>
                  <Input type="number" placeholder="0" value={paidAmount || ""} onChange={e => setPaidAmount(Number(e.target.value))} />
                </div>
                {remainingAmount > 0 && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 p-2 flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Remaining</span>
                    <span className="font-bold text-destructive">Rs. {remainingAmount.toLocaleString()}</span>
                  </div>
                )}
                <Button className="w-full" size="lg" onClick={handleCompleteSale} disabled={saving}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {saving ? "Processing..." : `Complete Sale — Rs. ${totalAmount.toLocaleString()}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Mobile Variation Dialog */}
      <Dialog open={!!variationProduct} onOpenChange={open => { if (!open) setVariationProduct(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{variationProduct?.productName} — Select Options</DialogTitle></DialogHeader>
          {variationProduct && (
            <div className="space-y-4">
              {variationProduct.variations?.length > 0 && (
                <div className="space-y-2">
                  <Label>Variation</Label>
                  <Select value={selectedVarIdx} onValueChange={v => {
                    setSelectedVarIdx(v);
                    const vr = variationProduct.variations[Number(v)];
                    if (vr) setVarSalePrice(vr.salePrice);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {variationProduct.variations.map((v, i) => (
                        <SelectItem key={i} value={String(i)}>{v.storage} / {v.color} — Rs.{v.salePrice.toLocaleString()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input type="number" min={1} value={varQty} onChange={e => {
                    const q = Number(e.target.value) || 1;
                    setVarQty(q);
                    setVarIMEIs(Array.from({ length: q }, (_, i) => varIMEIs[i] || ""));
                  }} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sale Price</Label>
                  <Input type="number" value={varSalePrice} onChange={e => setVarSalePrice(Number(e.target.value))} />
                </div>
              </div>
              {variationProduct.imeiTracking && (
                <div className="space-y-2">
                  <Label className="text-xs">IMEI Numbers ({varIMEIs.filter(Boolean).length}/{varQty})</Label>
                  {varIMEIs.map((imei, idx) => (
                    <Input key={idx} placeholder={`IMEI #${idx + 1}`} value={imei}
                      onChange={e => setVarIMEIs(prev => prev.map((v, i) => i === idx ? e.target.value.trim() : v))} />
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariationProduct(null)}>Cancel</Button>
            <Button onClick={handleAddMobileToCart}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input placeholder="Customer name" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input placeholder="03001234567" value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNewCustomer}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice */}
      <SaleInvoice open={!!printSale} onOpenChange={open => { if (!open) setPrintSale(null); }} sale={printSale} />
    </div>
  );
};

export default POS;
