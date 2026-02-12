import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, BookOpen, CreditCard } from "lucide-react";
import { deleteSupplierOffline, Supplier } from "@/lib/offlineSupplierService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  suppliers: Supplier[];
  onRefresh: () => void;
  onEdit: (supplier: Supplier) => void;
  onPay: (supplier: Supplier) => void;
  onViewLedger: (supplier: Supplier) => void;
}

const SupplierList = ({ suppliers, onRefresh, onEdit, onPay, onViewLedger }: Props) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const filtered = suppliers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  );

  const handleDelete = async (supplier: Supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    try {
      await deleteSupplierOffline(supplier.localId);
      toast({ title: "Supplier Deleted" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              <TableHead>Sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.localId}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell>{s.cnic || "—"}</TableCell>
                <TableCell className="text-right font-semibold">Rs. {(s.currentBalance || 0).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={s.balanceType === "payable" ? "destructive" : "default"}>{s.balanceType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={s.syncStatus === "synced" ? "default" : "secondary"} className="text-xs">
                    {s.syncStatus === "synced" ? "✓ Synced" : "⏳ Pending"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Pay" onClick={() => onPay(s)}>
                      <CreditCard className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Ledger" onClick={() => onViewLedger(s)}>
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => onEdit(s)}>
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
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {suppliers.length === 0 ? "No suppliers yet. Add your first supplier." : "No results found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SupplierList;
