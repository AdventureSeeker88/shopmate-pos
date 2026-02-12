import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addSupplierPayment, recalculateSupplierBalance, Supplier } from "@/lib/supplierService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

const PaySupplierDialog = ({ open, onOpenChange, supplier }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    method: "cash" as "cash" | "bank" | "wallet",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Error", description: "Enter a valid amount.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await addSupplierPayment({
        supplierId: supplier.id,
        amount,
        method: form.method,
        date: new Date(form.date),
        note: form.note.trim(),
      });
      await recalculateSupplierBalance(supplier.id, supplier.openingBalance);
      toast({ title: "Payment Recorded", description: `Rs. ${amount.toLocaleString()} paid to ${supplier.name}` });
      setForm({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], note: "" });
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
          <DialogTitle>Pay to {supplier?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current Balance</Label>
            <p className="text-lg font-semibold text-foreground">
              Rs. {supplier?.currentBalance?.toLocaleString() || 0}{" "}
              <span className={`text-sm ${supplier?.balanceType === "payable" ? "text-destructive" : "text-green-600"}`}>
                ({supplier?.balanceType || "payable"})
              </span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount *</Label>
            <Input id="amount" type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Payment note" maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Processing..." : "Pay"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PaySupplierDialog;
