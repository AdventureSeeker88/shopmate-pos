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
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Pencil, Trash2, Wifi, WifiOff, AlertTriangle, ListFilter,
} from "lucide-react";
import {
  getAllProducts, addProduct, updateProduct, deleteProduct,
  startProductAutoSync, Product, ProductVariation,
} from "@/lib/offlineProductService";
import { getAllCategories, Category } from "@/lib/offlineCategoryService";

const MOBILE_CATEGORY = "mobile";

const emptyForm = {
  productName: "", categoryId: "", categoryName: "", costPrice: 0, salePrice: 0,
  currentStock: 0, stockAlertQty: 5, isMobile: false, brand: "", model: "",
  storage: "", color: "", imeiTracking: false, variations: [] as ProductVariation[],
};

const emptyVariation: ProductVariation = { storage: "", color: "", costPrice: 0, salePrice: 0 };

const Products = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState(emptyForm);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([getAllProducts(), getAllCategories()]);
      setProducts(p);
      setCategories(c);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    startProductAutoSync();
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const handleCategoryChange = (catLocalId: string) => {
    const cat = categories.find(c => c.localId === catLocalId);
    const isMobile = cat?.categoryName.toLowerCase() === MOBILE_CATEGORY;
    setForm(f => ({
      ...f, categoryId: catLocalId, categoryName: cat?.categoryName || "",
      isMobile, imeiTracking: isMobile,
      variations: isMobile && f.variations.length === 0 ? [{ ...emptyVariation }] : f.variations,
    }));
  };

  const handleSave = async () => {
    if (!form.productName.trim() || !form.categoryId) {
      toast({ title: "Error", description: "Product name and category are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editProduct) {
        await updateProduct(editProduct.localId, form);
        toast({ title: "Product Updated" });
      } else {
        await addProduct(form);
        toast({ title: "Product Added" });
      }
      setForm(emptyForm);
      setEditProduct(null);
      setTab("list");
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      productName: p.productName, categoryId: p.categoryId, categoryName: p.categoryName,
      costPrice: p.costPrice, salePrice: p.salePrice, currentStock: p.currentStock,
      stockAlertQty: p.stockAlertQty, isMobile: p.isMobile, brand: p.brand,
      model: p.model, storage: p.storage, color: p.color, imeiTracking: p.imeiTracking,
      variations: p.variations || [],
    });
    setTab("add");
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteProduct(deleteConfirm.localId);
    setDeleteConfirm(null);
    await load();
    toast({ title: "Product Deleted" });
  };

  const addVariation = () => setForm(f => ({ ...f, variations: [...f.variations, { ...emptyVariation }] }));
  const removeVariation = (idx: number) => setForm(f => ({ ...f, variations: f.variations.filter((_, i) => i !== idx) }));
  const updateVariation = (idx: number, field: keyof ProductVariation, value: string | number) => {
    setForm(f => ({
      ...f, variations: f.variations.map((v, i) => i === idx ? { ...v, [field]: value } : v),
    }));
  };

  const lowStockProducts = products.filter(p => p.currentStock <= p.stockAlertQty);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Product Management</h1>
          <Badge variant={online ? "default" : "destructive"} className="mt-2 text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><Package className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : products.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-destructive/10 p-3"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : lowStockProducts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><ListFilter className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Categories</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : categories.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list"><Package className="h-4 w-4 mr-1.5" /> Products</TabsTrigger>
          <TabsTrigger value="add"><Plus className="h-4 w-4 mr-1.5" /> {editProduct ? "Edit" : "Add New"}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : products.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Package className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                <p className="font-medium text-muted-foreground">No products yet</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("add")}>
                  <Plus className="h-4 w-4 mr-1" /> Add Product
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
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Variations</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Sale</TableHead>
                        <TableHead className="text-center">Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map(p => (
                        <TableRow key={p.localId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{p.productName}</p>
                              {p.isMobile && <p className="text-xs text-muted-foreground">{p.brand} {p.model}</p>}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{p.categoryName}</Badge></TableCell>
                          <TableCell>
                            {p.variations && p.variations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.variations.map((v, i) => (
                                  <p key={i} className="text-xs text-muted-foreground">
                                    {v.storage} / {v.color} — Rs.{v.costPrice.toLocaleString()}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">Rs. {p.costPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {p.salePrice.toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={p.currentStock <= p.stockAlertQty ? "destructive" : "secondary"}>
                              {p.currentStock}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.syncStatus === "synced" ? "default" : "secondary"} className="text-[10px]">
                              {p.syncStatus === "synced" ? "✓" : "⏳"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

        <TabsContent value="add" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{editProduct ? "Edit Product" : "Add New Product"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input placeholder="Enter product name" value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={form.categoryId} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.localId} value={c.localId}>{c.categoryName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default Cost Price</Label>
                  <Input type="number" placeholder="0" value={form.costPrice || ""} onChange={e => setForm(f => ({ ...f, costPrice: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Default Sale Price</Label>
                  <Input type="number" placeholder="0" value={form.salePrice || ""} onChange={e => setForm(f => ({ ...f, salePrice: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Stock Alert Qty</Label>
                  <Input type="number" placeholder="5" value={form.stockAlertQty || ""} onChange={e => setForm(f => ({ ...f, stockAlertQty: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Mobile-specific fields */}
              {form.isMobile && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-primary">📱 Mobile Details</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Brand</Label>
                        <Input placeholder="Samsung, Apple..." value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Input placeholder="A32, iPhone 12..." value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
                      </div>
                    </div>

                    {/* Variations */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">📦 Variations (Storage / Color / Price)</Label>
                        <Button type="button" size="sm" variant="outline" onClick={addVariation}>
                          <Plus className="h-3 w-3 mr-1" /> Add Variation
                        </Button>
                      </div>
                      {form.variations.map((v, idx) => (
                        <div key={idx} className="rounded-lg border bg-background p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Variation #{idx + 1}</span>
                            {form.variations.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeVariation(idx)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Storage</Label>
                              <Input placeholder="4/64, 6/128..." value={v.storage} onChange={e => updateVariation(idx, "storage", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Color</Label>
                              <Input placeholder="Black, Blue..." value={v.color} onChange={e => updateVariation(idx, "color", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Cost Price</Label>
                              <Input type="number" placeholder="0" value={v.costPrice || ""} onChange={e => updateVariation(idx, "costPrice", Number(e.target.value))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Sale Price</Label>
                              <Input type="number" placeholder="0" value={v.salePrice || ""} onChange={e => updateVariation(idx, "salePrice", Number(e.target.value))} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editProduct ? "Update Product" : "Add Product"}
                </Button>
                {editProduct && (
                  <Button variant="outline" onClick={() => { setEditProduct(null); setForm(emptyForm); setTab("list"); }}>Cancel</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Product</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete "{deleteConfirm?.productName}"? This will also remove all associated IMEI records.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
