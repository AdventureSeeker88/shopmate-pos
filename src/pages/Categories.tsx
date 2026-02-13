import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tags, Plus, Pencil, Trash2, Wifi, WifiOff } from "lucide-react";
import {
  getAllCategories, addCategory, updateCategory, deleteCategory,
  startCategoryAutoSync, Category,
} from "@/lib/offlineCategoryService";

const Categories = () => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [newName, setNewName] = useState("");
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCategories(await getAllCategories()); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    startCategoryAutoSync();
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await addCategory(name);
      setNewName("");
      await load();
      toast({ title: "Category Added" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editCat || !editName.trim()) return;
    setSaving(true);
    try {
      await updateCategory(editCat.localId, editName.trim());
      setEditCat(null);
      await load();
      toast({ title: "Category Updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.categoryName}"?`)) return;
    await deleteCategory(cat.localId);
    await load();
    toast({ title: "Category Deleted" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Category Management</h1>
          <Badge variant={online ? "default" : "destructive"} className="mt-2 text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
        <div className="rounded-lg bg-primary/10 p-3">
          <Tags className="h-6 w-6 text-primary" />
        </div>
      </div>

      {/* Add Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add New Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="catName" className="sr-only">Category Name</Label>
              <Input
                id="catName"
                placeholder="Enter category name (e.g. Mobile, Cover, Glass...)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
            </div>
            <Button onClick={handleAdd} disabled={saving || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Category List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Categories
            <Badge variant="secondary">{categories.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Tags className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No categories yet</p>
              <p className="text-sm mt-1">Add your first category above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Category Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat, idx) => (
                  <TableRow key={cat.localId}>
                    <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{cat.categoryName}</TableCell>
                    <TableCell>
                      <Badge variant={cat.syncStatus === "synced" ? "default" : "secondary"} className="text-[10px]">
                        {cat.syncStatus === "synced" ? "✓ Synced" : "⏳ Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditCat(cat); setEditName(cat.categoryName); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cat)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editCat} onOpenChange={open => { if (!open) setEditCat(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Category Name</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCat(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Categories;
