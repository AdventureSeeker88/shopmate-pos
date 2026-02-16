import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addSupplierPaymentOffline, Supplier } from "@/lib/offlineSupplierService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  onPaid: () => void;
}

const PaySupplierDialog = ({ open, onOpenChange, supplier, onPaid }: Props) => {
  const isPayable = supplier?.balanceType === "payable";
  const actionLabel = isPayable ? "Receive from Supplier" : "Pay to Supplier";
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
      await addSupplierPaymentOffline({
        supplierLocalId: supplier.localId,
        amount,
        method: form.method,
        date: form.date,
        note: form.note.trim(),
      });
      toast({
        title: "Payment Recorded",
        description: `Rs. ${amount.toLocaleString()} paid to ${supplier.name}. ${navigator.onLine ? "Synced" : "Will sync when online"}`,
      });
      setForm({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], note: "" });
      onPaid();
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
          <DialogTitle>{actionLabel} — {supplier?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current Balance</Label>
            <p className="text-lg font-semibold text-foreground">
              Rs. {supplier?.currentBalance?.toLocaleString() || 0}{" "}
              <Badge variant={supplier?.balanceType === "payable" ? "destructive" : "default"}>{supplier?.balanceType || "payable"}</Badge>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Payment Amount *</Label>
            <Input id="pay-amount" type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
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
            <Label htmlFor="pay-date">Date</Label>
            <Input id="pay-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Input id="pay-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Payment note" maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Processing..." : actionLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PaySupplierDialog;
