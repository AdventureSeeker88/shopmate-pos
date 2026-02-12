import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, BookOpen, CreditCard } from "lucide-react";
import { subscribeSuppliers, deleteSupplier, Supplier } from "@/lib/supplierService";
import { useToast } from "@/hooks/use-toast";
import AddSupplierDialog from "@/components/suppliers/AddSupplierDialog";
import PaySupplierDialog from "@/components/suppliers/PaySupplierDialog";
import SupplierLedger from "@/components/suppliers/SupplierLedger";

const Suppliers = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    const unsub = subscribeSuppliers(setSuppliers);
    return unsub;
  }, []);

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search)
  );

  const handleDelete = async (supplier: Supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    try {
      await deleteSupplier(supplier.id);
      toast({ title: "Supplier Deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // If viewing ledger, show ledger view
  if (ledgerSupplier) {
    return (
      <div>
        <SupplierLedger supplier={ledgerSupplier} onBack={() => setLedgerSupplier(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Suppliers</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>CNIC</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell>{s.cnic || "—"}</TableCell>
                <TableCell className="text-right font-semibold">
                  Rs. {(s.currentBalance || 0).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={s.balanceType === "payable" ? "destructive" : "default"}>
                    {s.balanceType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Pay" onClick={() => setPaySupplier(s)}>
                      <CreditCard className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Ledger" onClick={() => setLedgerSupplier(s)}>
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditSupplier(s); setAddOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(s)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {suppliers.length === 0 ? "No suppliers yet. Add your first supplier." : "No results found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AddSupplierDialog
        open={addOpen}
        onOpenChange={(open) => { setAddOpen(open); if (!open) setEditSupplier(null); }}
        editSupplier={editSupplier}
      />
      <PaySupplierDialog
        open={!!paySupplier}
        onOpenChange={(open) => { if (!open) setPaySupplier(null); }}
        supplier={paySupplier}
      />
    </div>
  );
};

export default Suppliers;
