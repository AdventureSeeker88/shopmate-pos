import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCustomerPayment, Customer } from "@/lib/offlineCustomerService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onPaid: () => void;
}

const PayCustomerDialog = ({ open, onOpenChange, customer, onPaid }: Props) => {
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
    if (!customer) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Error", description: "Enter a valid amount.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await addCustomerPayment({
        customerLocalId: customer.localId,
        amount,
        method: form.method,
        date: form.date,
        note: form.note.trim(),
      });
      toast({
        title: "Payment Recorded",
        description: `Rs. ${amount.toLocaleString()} received from ${customer.name}. ${navigator.onLine ? "Synced" : "Will sync when online"}`,
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
          <DialogTitle>Receive Payment — {customer?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current Balance</Label>
            <p className="text-lg font-semibold text-foreground">
              Rs. {customer?.currentBalance?.toLocaleString() || 0}{" "}
              <Badge variant={customer?.balanceType === "payable" ? "destructive" : "default"}>{customer?.balanceType || "payable"}</Badge>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-pay-amount">Payment Amount *</Label>
            <Input id="cust-pay-amount" type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
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
            <Label htmlFor="cust-pay-date">Date</Label>
            <Input id="cust-pay-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-pay-note">Note (optional)</Label>
            <Input id="cust-pay-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Payment note" maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Processing..." : "Receive Payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PayCustomerDialog;
