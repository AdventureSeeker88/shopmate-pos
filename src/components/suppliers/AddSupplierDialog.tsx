import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSupplier, updateSupplier, Supplier } from "@/lib/supplierService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSupplier?: Supplier | null;
}

const AddSupplierDialog = ({ open, onOpenChange, editSupplier }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: editSupplier?.name || "",
    phone: editSupplier?.phone || "",
    address: editSupplier?.address || "",
    cnic: editSupplier?.cnic || "",
  });

  const resetForm = () => setForm({ name: "", phone: "", address: "", cnic: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Error", description: "Name and Phone are required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (editSupplier) {
        await updateSupplier(editSupplier.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          cnic: form.cnic.trim(),
        });
        toast({ title: "Supplier Updated" });
      } else {
        await addSupplier({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          cnic: form.cnic.trim(),
          openingBalance: 0,
          balanceType: "payable",
        });
        toast({ title: "Supplier Added" });
      }
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03XX-XXXXXXX" maxLength={20} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address (optional)" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnic">CNIC / ID Card</Label>
            <Input id="cnic" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="XXXXX-XXXXXXX-X (optional)" maxLength={20} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : editSupplier ? "Update" : "Add Supplier"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSupplierDialog;
