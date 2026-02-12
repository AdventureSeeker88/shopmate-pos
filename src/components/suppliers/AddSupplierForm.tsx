import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addSupplierOffline, updateSupplierOffline, Supplier } from "@/lib/offlineSupplierService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  editSupplier?: Supplier | null;
  onSaved: () => void;
  onCancel?: () => void;
}

const AddSupplierForm = ({ editSupplier, onSaved, onCancel }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    cnic: "",
  });

  useEffect(() => {
    if (editSupplier) {
      setForm({
        name: editSupplier.name,
        phone: editSupplier.phone,
        address: editSupplier.address,
        cnic: editSupplier.cnic,
      });
    } else {
      setForm({ name: "", phone: "", address: "", cnic: "" });
    }
  }, [editSupplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Error", description: "Name and Phone are required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (editSupplier) {
        await updateSupplierOffline(editSupplier.localId, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          cnic: form.cnic.trim(),
        });
        toast({ title: "Supplier Updated", description: navigator.onLine ? "Saved & synced" : "Saved locally, will sync when online" });
      } else {
        await addSupplierOffline({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          cnic: form.cnic.trim(),
          openingBalance: 0,
          balanceType: "payable",
        });
        toast({ title: "Supplier Added", description: navigator.onLine ? "Saved & synced" : "Saved locally, will sync when online" });
      }
      setForm({ name: "", phone: "", address: "", cnic: "" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{editSupplier ? "Edit Supplier" : "Add New Supplier"}</CardTitle>
      </CardHeader>
      <CardContent>
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
          <div className="flex gap-3">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : editSupplier ? "Update Supplier" : "Add Supplier"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddSupplierForm;
