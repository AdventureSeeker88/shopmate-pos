import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Printer, Tag, Package } from "lucide-react";
import { getAllProducts, Product } from "@/lib/offlineProductService";
import { getAllCategories, Category } from "@/lib/offlineCategoryService";
import { getShopSettings } from "@/lib/shopSettings";

const PriceList = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printMode, setPrintMode] = useState<"list" | "labels">("list");
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([getAllProducts(), getAllCategories()]);
      setProducts(p);
      setCategories(c);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = products.filter(p =>
    p.productName.toLowerCase().includes(q) ||
    p.brand?.toLowerCase().includes(q) ||
    p.model?.toLowerCase().includes(q) ||
    p.categoryName?.toLowerCase().includes(q)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.localId)));
  };

  const selectedProducts = products.filter(p => selectedIds.has(p.localId));
  const shop = getShopSettings();

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Price ${printMode === "labels" ? "Labels" : "List"}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 10mm; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        .header { text-align: center; margin-bottom: 10mm; }
        .header h1 { font-size: 16px; }
        .header p { font-size: 11px; color: #666; }
        .labels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
        .label { border: 1px solid #333; padding: 4mm; border-radius: 2mm; text-align: center; page-break-inside: avoid; }
        .label .name { font-weight: 700; font-size: 12px; margin-bottom: 2mm; }
        .label .detail { font-size: 9px; color: #666; margin-bottom: 1mm; }
        .label .price { font-size: 16px; font-weight: 700; margin-top: 2mm; }
        @media print { body { padding: 5mm; } }
      </style></head><body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const printProducts = selectedProducts.length > 0 ? selectedProducts : filtered;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Price List</h1>
          <p className="text-sm text-muted-foreground">Search, view & print price labels</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${printMode === "list" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              onClick={() => setPrintMode("list")}>List</button>
            <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${printMode === "labels" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              onClick={() => setPrintMode("labels")}>Labels</button>
          </div>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Print {selectedIds.size > 0 ? `(${selectedIds.size})` : "All"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, brand, model, category..." className="pl-9"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Product Table with checkboxes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Products ({filtered.length})
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
              {selectedIds.size === filtered.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No products found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Brand/Model</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.localId} className={selectedIds.has(p.localId) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(p.localId)} onCheckedChange={() => toggleSelect(p.localId)} />
                    </TableCell>
                    <TableCell className="text-xs font-medium">{p.productName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.categoryName || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.brand ? `${p.brand} ${p.model || ""}` : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-bold text-primary">
                      Rs. {p.salePrice.toLocaleString()}
                      {p.variations?.length > 0 && (
                        <span className="text-[9px] text-muted-foreground block">
                          {p.variations.map(v => `${v.storage}/${v.color}: Rs.${v.salePrice.toLocaleString()}`).join(" | ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      <Badge variant={p.currentStock <= (p.stockAlertQty || 0) ? "destructive" : "secondary"} className="text-[10px]">
                        {p.currentStock}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Hidden print content */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="header">
            <h1>{shop.shopName}</h1>
            <p>{shop.address} | {shop.phone}</p>
            <p style={{ marginTop: "2mm" }}>Price {printMode === "labels" ? "Labels" : "List"} — {new Date().toLocaleDateString()}</p>
          </div>

          {printMode === "list" ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Brand/Model</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {printProducts.map((p, i) => (
                  <tr key={p.localId}>
                    <td>{i + 1}</td>
                    <td>{p.productName}</td>
                    <td>{p.categoryName || "—"}</td>
                    <td>{p.brand ? `${p.brand} ${p.model || ""}` : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                      Rs. {p.salePrice.toLocaleString()}
                      {p.variations?.map(v => (
                        <div key={v.storage + v.color} style={{ fontSize: "9px", color: "#666" }}>
                          {v.storage}/{v.color}: Rs. {v.salePrice.toLocaleString()}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="labels">
              {printProducts.map(p => (
                <div key={p.localId} className="label">
                  <div className="name">{p.productName}</div>
                  {p.brand && <div className="detail">{p.brand} {p.model}</div>}
                  {p.categoryName && <div className="detail">{p.categoryName}</div>}
                  <div className="price">Rs. {p.salePrice.toLocaleString()}</div>
                  {p.variations?.map(v => (
                    <div key={v.storage + v.color} className="detail" style={{ marginTop: "1mm" }}>
                      {v.storage}/{v.color}: Rs. {v.salePrice.toLocaleString()}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceList;
