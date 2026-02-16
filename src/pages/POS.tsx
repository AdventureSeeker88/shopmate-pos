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
  ScanBarcode, Users, CreditCard, X, AlertCircle, Package, Box, Smartphone,
} from "lucide-react";
import { getAllProducts, Product, getIMEIsByProduct, searchIMEIByPartial, IMEIRecord } from "@/lib/offlineProductService";
import { getAllCategories, Category } from "@/lib/offlineCategoryService";
import { getAllCustomers, addCustomer, Customer } from "@/lib/offlineCustomerService";
import { addSale, SaleItem, Sale } from "@/lib/offlineSaleService";
import SaleInvoice from "@/components/sales/SaleInvoice";

interface CartItem extends SaleItem {
  margin: number;
  conditionType: "with_box" | "with_accessories" | "without";
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", cnic: "", address: "" });

  // Payment
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "wallet">("cash");
  const [balanceAdjust, setBalanceAdjust] = useState(0);

  // IMEI search
  const [imeiSearch, setImeiSearch] = useState("");
  const [imeiResults, setImeiResults] = useState<(IMEIRecord & { product?: Product })[]>([]);
  const [showImeiResults, setShowImeiResults] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Invoice
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);

  // Add to cart dialog (for mobile products)
  const [addDialog, setAddDialog] = useState<{
    product: Product;
    selectedImei: string;
    salePrice: number;
    quantity: number;
    conditionType: "with_box" | "with_accessories" | "without";
    availableImeis: IMEIRecord[];
  } | null>(null);

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

  // Filter products by category and search
  const filteredProducts = products.filter(p => {
    if (selectedCategory !== "all") {
      const selectedCat = categories.find(c => c.localId === selectedCategory);
      const matchById = p.categoryId === selectedCategory;
      const matchByName = selectedCat && p.categoryName && 
        p.categoryName.toLowerCase() === selectedCat.categoryName.toLowerCase();
      if (!matchById && !matchByName) return false;
    }
    if (searchQuery && !p.productName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.brand?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.model?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Customer search/auto-fill
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return c.status === "active";
    const q = customerSearch.toLowerCase();
    return c.status === "active" && (c.name.toLowerCase().includes(q) || c.phone.includes(q));
  });

  const handleCustomerSearchSelect = (localId: string) => {
    setSelectedCustomer(localId);
    setCustomerSearch("");
    setBalanceAdjust(0);
  };

  // Auto-fill new customer if name/phone matches existing
  const handleNewCustFieldBlur = () => {
    if (!newCust.name && !newCust.phone) return;
    const match = customers.find(c =>
      (newCust.phone && c.phone === newCust.phone) ||
      (newCust.name && c.name.toLowerCase() === newCust.name.toLowerCase() && c.phone)
    );
    if (match) {
      setNewCust({ name: match.name, phone: match.phone, cnic: match.cnic || "", address: match.address || "" });
      setSelectedCustomer(match.localId);
      setAddCustomerOpen(false);
      toast({ title: "Customer Found", description: `${match.name} auto-selected` });
    }
  };

  // IMEI partial search (last 3-4 digits)
  const handleImeiSearch = async (value: string) => {
    setImeiSearch(value);
    if (value.length >= 3) {
      const results = await searchIMEIByPartial(value);
      setImeiResults(results);
      setShowImeiResults(results.length > 0);
    } else {
      setImeiResults([]);
      setShowImeiResults(false);
    }
  };

  const handleImeiSelect = (record: IMEIRecord & { product?: Product }) => {
    if (!record.product) return;
    const p = record.product;
    // Check if this IMEI is already in cart
    if (cart.some(c => c.imeiNumbers.includes(record.imei))) {
      toast({ title: "Already in Cart", variant: "destructive" });
      return;
    }
    const v = p.variations?.find(v => v.storage === p.storage && v.color === p.color) || p.variations?.[0];
    setAddDialog({
      product: p,
      selectedImei: record.imei,
      salePrice: v?.salePrice || p.salePrice,
      quantity: 1,
      conditionType: "with_box",
      availableImeis: [],
    });
    setImeiSearch("");
    setShowImeiResults(false);
  };

  const handleImeiKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const imei = imeiSearch.trim();
    if (!imei) return;
    // Try exact match first
    for (const p of products) {
      if (!p.isMobile) continue;
      const imeis = await getIMEIsByProduct(p.localId);
      const found = imeis.find(r => r.imei === imei && r.status === "in_stock");
      if (found) {
        handleImeiSelect({ ...found, product: p });
        return;
      }
    }
    // Try partial match
    if (imei.length >= 3) {
      const results = await searchIMEIByPartial(imei);
      if (results.length === 1) {
        handleImeiSelect(results[0]);
      } else if (results.length > 1) {
        setImeiResults(results);
        setShowImeiResults(true);
      } else {
        toast({ title: "IMEI Not Found", variant: "destructive" });
      }
    }
    setImeiSearch("");
  };

  // Click product → open add dialog
  const handleProductClick = async (p: Product) => {
    if (p.isMobile) {
      const imeis = await getIMEIsByProduct(p.localId);
      const available = imeis.filter(r => r.status === "in_stock" && !cart.some(c => c.imeiNumbers.includes(r.imei)));
      setAddDialog({
        product: p,
        selectedImei: available[0]?.imei || "",
        salePrice: p.variations?.[0]?.salePrice || p.salePrice,
        quantity: 1,
        conditionType: "with_box",
        availableImeis: available,
      });
    } else {
      // Non-mobile: direct add or increment
      if (p.currentStock <= 0) {
        toast({ title: "Out of Stock", variant: "destructive" });
        return;
      }
      const existing = cart.find(c => c.productLocalId === p.localId);
      if (existing) {
        setCart(cart.map(c => c.productLocalId === p.localId
          ? { ...c, quantity: c.quantity + 1, total: c.salePrice * (c.quantity + 1), margin: (c.salePrice - c.costPrice) * (c.quantity + 1) }
          : c));
      } else {
        setCart([...cart, {
          productLocalId: p.localId, productName: p.productName,
          quantity: 1, costPrice: p.costPrice, salePrice: p.salePrice,
          total: p.salePrice, imeiNumbers: [], margin: p.salePrice - p.costPrice,
          conditionType: "without",
        }]);
      }
    }
  };

  const handleConfirmAddToCart = () => {
    if (!addDialog) return;
    const { product: p, selectedImei, salePrice, quantity, conditionType } = addDialog;

    if (p.isMobile && p.imeiTracking && !selectedImei) {
      toast({ title: "Select IMEI", variant: "destructive" });
      return;
    }
    if (p.currentStock <= 0) {
      toast({ title: "Out of Stock", variant: "destructive" });
      return;
    }

    const costPrice = p.variations?.[0]?.costPrice || p.costPrice;
    const condLabel = conditionType === "with_box" ? " (Box)" : conditionType === "with_accessories" ? " (Acc)" : "";

    setCart(prev => [...prev, {
      productLocalId: p.localId,
      productName: p.productName + condLabel,
      quantity,
      costPrice,
      salePrice,
      total: salePrice * quantity,
      imeiNumbers: selectedImei ? [selectedImei] : [],
      variationStorage: p.storage || p.variations?.[0]?.storage || "",
      variationColor: p.color || p.variations?.[0]?.color || "",
      margin: (salePrice - costPrice) * quantity,
      conditionType,
    }]);
    setAddDialog(null);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  const updateCartPrice = (idx: number, price: number) => {
    setCart(cart.map((c, i) => i === idx
      ? { ...c, salePrice: price, total: price * c.quantity, margin: (price - c.costPrice) * c.quantity }
      : c));
  };
  const updateCartQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    setCart(cart.map((c, i) => i === idx
      ? { ...c, quantity: qty, total: c.salePrice * qty, margin: (c.salePrice - c.costPrice) * qty }
      : c));
  };

  const totalAmount = cart.reduce((s, c) => s + c.total, 0);
  const totalMargin = cart.reduce((s, c) => s + c.margin, 0);
  const selectedCustomerData = customers.find(c => c.localId === selectedCustomer);
  const grandTotal = totalAmount + balanceAdjust;
  const remainingAmount = Math.max(0, grandTotal - paidAmount);

  const handleAddNewCustomer = async () => {
    if (!newCust.name.trim() || !newCust.phone.trim()) {
      toast({ title: "Name & Phone required", variant: "destructive" });
      return;
    }
    const localId = await addCustomer({
      name: newCust.name, phone: newCust.phone, cnic: newCust.cnic, address: newCust.address,
      openingBalance: 0, balanceType: "payable",
    });
    const updated = await getAllCustomers();
    setCustomers(updated);
    setSelectedCustomer(localId);
    setAddCustomerOpen(false);
    setNewCust({ name: "", phone: "", cnic: "", address: "" });
    toast({ title: "Customer Added" });
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) { toast({ title: "Cart Empty", variant: "destructive" }); return; }
    const cust = customers.find(c => c.localId === selectedCustomer);
    setSaving(true);
    try {
      const actualTotal = grandTotal;
      const payStatus = paidAmount >= actualTotal ? "paid" : paidAmount > 0 ? "partial" : "pending";
      const result = await addSale({
        customerLocalId: cust?.localId || "", customerName: cust?.name || "Walk-in Customer",
        customerId: cust?.id || "", customerPhone: cust?.phone || "",
        items: cart.map(({ margin, conditionType, ...rest }) => rest),
        totalAmount: actualTotal, paidAmount, paymentStatus: payStatus, saleDate: new Date().toISOString(),
      });
      // If balance adjustment was used, record it as a payment from previous balance
      if (balanceAdjust > 0 && cust) {
        const { addCustomerLedgerEntry, recalculateCustomerBalance } = await import("@/lib/offlineCustomerService");
        await addCustomerLedgerEntry({
          customerId: cust.id, customerLocalId: cust.localId,
          date: new Date().toISOString(), type: "payment",
          description: `Previous balance adjusted on ${result.invoiceNumber}`,
          amount: balanceAdjust,
        });
        await recalculateCustomerBalance(cust.localId);
      }
      setPrintSale(result.sale);
      toast({ title: "Sale Completed!", description: `Invoice: ${result.invoiceNumber}` });
      setCart([]); setSelectedCustomer(""); setPaidAmount(0); setPaymentMethod("cash"); setBalanceAdjust(0);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Group products by category for display
  const getCategoryProducts = (catId: string) => {
    const cat = categories.find(c => c.localId === catId);
    return filteredProducts.filter(p => 
      p.categoryId === catId || 
      (cat && p.categoryName && p.categoryName.toLowerCase() === cat.categoryName.toLowerCase())
    );
  };
  const uncategorized = filteredProducts.filter(p => {
    if (!p.categoryId && !p.categoryName) return true;
    return !categories.find(c => c.localId === p.categoryId || 
      (p.categoryName && c.categoryName.toLowerCase() === p.categoryName.toLowerCase()));
  });

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">POS</h1>
          <Badge variant={online ? "default" : "destructive"} className="text-[10px] gap-1 h-5">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0">
        {/* Left: Categories */}
        <div className="lg:col-span-2 flex lg:flex-col gap-1 overflow-auto">
          <Button size="sm" variant={selectedCategory === "all" ? "default" : "outline"}
            className="text-xs justify-start shrink-0 h-8" onClick={() => setSelectedCategory("all")}>
            <Package className="h-3 w-3 mr-1" /> All
          </Button>
          {categories.map(c => {
            const count = products.filter(p => 
              (p.categoryId === c.localId || 
               (p.categoryName && p.categoryName.toLowerCase() === c.categoryName.toLowerCase())) 
              && p.currentStock > 0
            ).length;
            return (
              <Button key={c.localId} size="sm"
                variant={selectedCategory === c.localId ? "default" : "outline"}
                className="text-xs justify-between shrink-0 h-8"
                onClick={() => setSelectedCategory(c.localId)}>
                <span className="truncate">{c.categoryName}</span>
                <Badge variant="secondary" className="text-[9px] h-4 ml-1">{count}</Badge>
              </Button>
            );
          })}
        </div>

        {/* Middle: Products */}
        <div className="lg:col-span-5 flex flex-col gap-2 min-h-0">
          {/* Search bars */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search by name/brand..." className="pl-8 h-8 text-xs"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input ref={scanRef} placeholder="IMEI (last 3-4 digits)..." className="pl-8 h-8 text-xs"
                value={imeiSearch} onChange={e => handleImeiSearch(e.target.value)} onKeyDown={handleImeiKeyDown} />
              {/* IMEI dropdown results */}
              {showImeiResults && imeiResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                  {imeiResults.map(r => (
                    <button key={r.localId}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent/50 border-b last:border-0 flex justify-between"
                      onClick={() => handleImeiSelect(r)}>
                      <div>
                        <span className="font-medium">{r.product?.productName}</span>
                        <span className="text-muted-foreground ml-2">{r.product?.brand} {r.product?.model}</span>
                      </div>
                      <span className="font-mono text-primary">{r.imei}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Products list - category wise */}
          <ScrollArea className="flex-1">
            {selectedCategory === "all" ? (
              <div className="space-y-3">
                {categories.map(cat => {
                  const catProducts = getCategoryProducts(cat.localId);
                  if (catProducts.length === 0) return null;
                  return (
                    <div key={cat.localId}>
                      <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                        <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">{cat.categoryName}</h3>
                        <Separator className="flex-1" />
                        <Badge variant="outline" className="text-[9px] h-4">{catProducts.length}</Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {catProducts.map(p => <ProductCard key={p.localId} product={p} onClick={() => handleProductClick(p)} />)}
                      </div>
                    </div>
                  );
                })}
                {uncategorized.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase">Other</h3>
                      <Separator className="flex-1" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {uncategorized.map(p => <ProductCard key={p.localId} product={p} onClick={() => handleProductClick(p)} />)}
                    </div>
                  </div>
                )}
                {filteredProducts.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    {loading ? "Loading..." : "No products found"}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {filteredProducts.map(p => <ProductCard key={p.localId} product={p} onClick={() => handleProductClick(p)} />)}
                {filteredProducts.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">
                    {loading ? "Loading..." : "No products in this category"}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Cart & Customer */}
        <div className="lg:col-span-5 flex flex-col gap-1.5 min-h-0">
          {/* Customer Section - compact inline */}
          <Card className="shrink-0">
            <CardContent className="p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input placeholder="Search customer..." className="pl-7 h-7 text-xs"
                    value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                    onFocus={() => setCustomerSearch(customerSearch)} />
                  {customerSearch && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-36 overflow-auto">
                      {filteredCustomers.map(c => (
                        <button key={c.localId}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 border-b last:border-0"
                          onClick={() => { handleCustomerSearchSelect(c.localId); }}>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground ml-2">{c.phone}</span>
                          {c.currentBalance > 0 && (
                            <Badge variant="destructive" className="text-[9px] ml-2 h-4">
                              Rs.{c.currentBalance.toLocaleString()} {c.balanceType}
                            </Badge>
                          )}
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No customer found</div>
                      )}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 shrink-0" onClick={() => setAddCustomerOpen(true)}>
                  <Plus className="h-3 w-3 mr-0.5" /> New
                </Button>
              </div>
              {selectedCustomerData && (
                <div className="bg-muted/50 rounded-md px-2 py-1.5 text-xs flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{selectedCustomerData.name}</span>
                  <span className="text-muted-foreground">{selectedCustomerData.phone}</span>
                  {selectedCustomerData.currentBalance > 0 && (
                    <Badge variant="destructive" className="text-[9px] h-4">
                      Rs.{selectedCustomerData.currentBalance.toLocaleString()} {selectedCustomerData.balanceType}
                    </Badge>
                  )}
                  {selectedCustomerData.currentBalance > 0 && selectedCustomerData.balanceType === "payable" && cart.length > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[9px] text-muted-foreground">Add to bill:</span>
                      <Input type="number" min={0} max={selectedCustomerData.currentBalance}
                        className="h-5 text-[10px] w-16 px-1" placeholder="Adjust"
                        value={balanceAdjust || ""} onChange={e => {
                          const v = Math.min(Number(e.target.value) || 0, selectedCustomerData.currentBalance);
                          setBalanceAdjust(v);
                        }} />
                      <Button type="button" size="sm" variant="outline" className="h-5 text-[9px] px-1.5"
                        onClick={() => setBalanceAdjust(selectedCustomerData.currentBalance)}>Full</Button>
                    </div>
                  )}
                  <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 ml-auto" onClick={() => { setSelectedCustomer(""); setBalanceAdjust(0); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cart Items */}
          <Card className="flex-1 min-h-0 flex flex-col">
            <CardHeader className="p-2 pb-1 shrink-0">
              <CardTitle className="text-xs flex items-center gap-1">
                <ShoppingCart className="h-3.5 w-3.5" /> Cart
                <Badge variant="secondary" className="text-[10px] ml-1 h-4">{cart.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 flex-1 min-h-0">
              <ScrollArea className="h-full">
                {cart.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Select items to add
                  </div>
                ) : (
                  <div className="space-y-1">
                    {cart.map((item, idx) => (
                      <div key={idx} className="rounded-md border bg-card px-2 py-1.5">
                        <div className="flex justify-between items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold truncate leading-tight">{item.productName}</p>
                            {(item.variationStorage || item.variationColor) && (
                              <span className="text-[9px] text-primary">{item.variationStorage}/{item.variationColor}</span>
                            )}
                            {item.imeiNumbers.length > 0 && (
                              <span className="text-[9px] text-muted-foreground font-mono ml-1">IMEI: {item.imeiNumbers[0]}</span>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0" onClick={() => removeFromCart(idx)}>
                            <Trash2 className="h-2.5 w-2.5 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex items-center gap-0.5 text-[10px]">
                            <span className="text-muted-foreground">Qty:</span>
                            <Input type="number" min={1} className="h-4 w-10 text-[10px] px-0.5 text-center"
                              value={item.quantity} onChange={e => updateCartQty(idx, Number(e.target.value))} />
                          </div>
                          <span className="text-[9px] text-muted-foreground">C:{item.costPrice.toLocaleString()}</span>
                          <div className="flex items-center gap-0.5 ml-auto text-[10px]">
                            <span className="text-muted-foreground">P:</span>
                            <Input type="number" className="h-4 w-14 text-[10px] px-0.5" value={item.salePrice}
                              onChange={e => updateCartPrice(idx, Number(e.target.value))} />
                          </div>
                          <span className="text-[10px] text-primary font-semibold">M:{item.margin.toLocaleString()}</span>
                          <span className="text-[10px] font-bold ml-1">Rs.{item.total.toLocaleString()}</span>
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
            <Card className="shrink-0">
              <CardContent className="p-2.5 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-semibold">Rs. {totalAmount.toLocaleString()}</span>
                </div>
                {balanceAdjust > 0 && (
                  <div className="flex justify-between items-baseline text-destructive">
                    <span className="text-xs">Previous Balance</span>
                    <span className="text-sm font-semibold">+ Rs. {balanceAdjust.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold">Grand Total</span>
                  <span className="text-lg font-bold">Rs. {grandTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="font-semibold text-primary">Rs. {totalMargin.toLocaleString()}</span>
                </div>
                <Separator />
                {/* Payment Method */}
                <div className="flex items-center gap-1">
                  {(["cash", "bank", "wallet"] as const).map(m => (
                    <button key={m} type="button"
                      className={`flex-1 text-[11px] font-medium py-1.5 rounded-md border transition-all ${
                        paymentMethod === m
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-accent"
                      }`}
                      onClick={() => setPaymentMethod(m)}>
                      {m === "cash" ? "💵 Cash" : m === "bank" ? "🏦 Bank" : "📱 Wallet"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Paid</Label>
                  <Input type="number" className="h-8 text-sm" placeholder="0"
                    value={paidAmount || ""} onChange={e => setPaidAmount(Number(e.target.value))} />
                </div>
                {remainingAmount > 0 && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 p-1.5 flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Remaining</span>
                    <span className="font-bold text-destructive">Rs. {remainingAmount.toLocaleString()}</span>
                  </div>
                )}
                <Button className="w-full h-10" onClick={handleCompleteSale} disabled={saving}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {saving ? "Processing..." : `Complete Sale — Rs. ${grandTotal.toLocaleString()}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add to Cart Dialog (Mobile Products) */}
      <Dialog open={!!addDialog} onOpenChange={open => { if (!open) setAddDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{addDialog?.product.productName}</DialogTitle>
          </DialogHeader>
          {addDialog && (
            <div className="space-y-3">
              {/* Brand/Model info */}
              {addDialog.product.isMobile && (
                <div className="text-xs text-muted-foreground">
                  {addDialog.product.brand} {addDialog.product.model} • Stock: {addDialog.product.currentStock}
                </div>
              )}

              {/* Condition type buttons */}
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <div className="flex gap-1.5">
                  {([
                    { val: "with_box" as const, icon: Box, label: "With Box" },
                    { val: "with_accessories" as const, icon: Smartphone, label: "With Acc" },
                    { val: "without" as const, icon: Package, label: "Without" },
                  ]).map(({ val, icon: Icon, label }) => (
                    <Button key={val} size="sm" variant={addDialog.conditionType === val ? "default" : "outline"}
                      className="flex-1 text-[10px] h-7 gap-1"
                      onClick={() => setAddDialog({ ...addDialog, conditionType: val })}>
                      <Icon className="h-3 w-3" />{label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* IMEI selection */}
              {addDialog.product.imeiTracking && (
                <div className="space-y-1">
                  <Label className="text-xs">IMEI Number</Label>
                  {addDialog.availableImeis.length > 0 ? (
                    <Select value={addDialog.selectedImei} onValueChange={v => setAddDialog({ ...addDialog, selectedImei: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select IMEI" /></SelectTrigger>
                      <SelectContent>
                        {addDialog.availableImeis.map(r => (
                          <SelectItem key={r.localId} value={r.imei} className="text-xs font-mono">{r.imei}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input placeholder="Enter IMEI" className="h-8 text-xs font-mono"
                      value={addDialog.selectedImei}
                      onChange={e => setAddDialog({ ...addDialog, selectedImei: e.target.value })} />
                  )}
                </div>
              )}

              {/* Variation selection */}
              {addDialog.product.variations?.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Variant</Label>
                  <div className="flex gap-1 flex-wrap">
                    {addDialog.product.variations.map((v, i) => (
                      <Button key={i} size="sm" variant="outline"
                        className="text-[10px] h-6 px-2"
                        onClick={() => setAddDialog({ ...addDialog, salePrice: v.salePrice })}>
                        {v.storage}/{v.color} - Rs.{v.salePrice.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Qty & Price */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input type="number" min={1} className="h-8 text-xs"
                    value={addDialog.quantity} onChange={e => setAddDialog({ ...addDialog, quantity: Number(e.target.value) || 1 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sale Price</Label>
                  <Input type="number" className="h-8 text-xs"
                    value={addDialog.salePrice} onChange={e => setAddDialog({ ...addDialog, salePrice: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmAddToCart}>
              <ShoppingCart className="h-3 w-3 mr-1" /> Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog - all fields */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add / Find Customer</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input placeholder="Customer name" className="h-8 text-xs"
                value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })}
                onBlur={handleNewCustFieldBlur} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone *</Label>
              <Input placeholder="03001234567" className="h-8 text-xs"
                value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })}
                onBlur={handleNewCustFieldBlur} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CNIC</Label>
              <Input placeholder="Optional" className="h-8 text-xs"
                value={newCust.cnic} onChange={e => setNewCust({ ...newCust, cnic: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input placeholder="Optional" className="h-8 text-xs"
                value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddNewCustomer}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice */}
      <SaleInvoice open={!!printSale} onOpenChange={open => { if (!open) setPrintSale(null); }} sale={printSale} />
    </div>
  );
};

// Product card component
const ProductCard = ({ product: p, onClick }: { product: Product; onClick: () => void }) => (
  <div className={`rounded-md border p-2 cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${p.currentStock <= 0 ? "opacity-40 pointer-events-none" : ""}`}
    onClick={onClick}>
    <p className="text-xs font-semibold truncate">{p.productName}</p>
    {p.isMobile && (
      <p className="text-[10px] text-muted-foreground truncate">{p.brand} {p.model}</p>
    )}
    <div className="flex justify-between items-center mt-1">
      <span className="text-xs font-bold text-primary">Rs.{p.salePrice.toLocaleString()}</span>
      <Badge variant={p.currentStock <= (p.stockAlertQty || 0) ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
        {p.currentStock}
      </Badge>
    </div>
    {p.variations?.length > 0 && (
      <p className="text-[9px] text-muted-foreground mt-0.5">{p.variations.length} variant(s)</p>
    )}
  </div>
);

export default POS;
