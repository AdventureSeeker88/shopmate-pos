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
  Users, Plus, Pencil, Trash2, Wifi, WifiOff, BookOpen,
} from "lucide-react";
import {
  getAllCustomers, addCustomer, updateCustomer, deleteCustomer,
  startCustomerAutoSync, Customer,
} from "@/lib/offlineCustomerService";
import CustomerLedgerView from "@/components/customers/CustomerLedgerView";
import { format } from "date-fns";

const emptyForm = {
  name: "", phone: "", cnic: "", address: "",
  openingBalance: 0, balanceType: "payable" as "payable" | "receivable",
  createdAt: new Date().toISOString().split("T")[0],
};

const Customers = () => {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState(emptyForm);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers(await getAllCustomers()); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    startCustomerAutoSync();
    load();
    const on = () => { setOnline(true); load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Error", description: "Name and phone are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editCustomer) {
        await updateCustomer(editCustomer.localId, { ...form, createdAt: new Date(form.createdAt).toISOString() });
        toast({ title: "Customer Updated" });
      } else {
        await addCustomer({ ...form, createdAt: new Date(form.createdAt).toISOString() });
        toast({ title: "Customer Added" });
      }
      setForm({ ...emptyForm, createdAt: new Date().toISOString().split("T")[0] });
      setEditCustomer(null);
      setTab("list");
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleEdit = (c: Customer) => {
    setEditCustomer(c);
    setForm({
      name: c.name, phone: c.phone, cnic: c.cnic, address: c.address,
      openingBalance: c.openingBalance, balanceType: c.balanceType,
      createdAt: new Date(c.createdAt).toISOString().split("T")[0],
    });
    setTab("add");
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteCustomer(deleteConfirm.localId);
    setDeleteConfirm(null);
    await load();
    toast({ title: "Customer Deleted" });
  };

  if (ledgerCustomer) {
    return <CustomerLedgerView customer={ledgerCustomer} onBack={() => { setLedgerCustomer(null); load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Customer Management</h1>
          <Badge variant={online ? "default" : "destructive"} className="mt-2 text-xs gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Customers</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : customers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-destructive/10 p-3"><Users className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Payable</p>
              <p className="text-2xl font-bold text-destructive">
                Rs. {loading ? "—" : customers.filter(c => c.balanceType === "payable").reduce((s, c) => s + c.currentBalance, 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : customers.filter(c => c.status === "active").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list"><Users className="h-4 w-4 mr-1.5" /> Customers</TabsTrigger>
          <TabsTrigger value="add"><Plus className="h-4 w-4 mr-1.5" /> {editCustomer ? "Edit" : "Add New"}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : customers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                <p className="font-medium text-muted-foreground">No customers yet</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("add")}><Plus className="h-4 w-4 mr-1" /> Add Customer</Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>CNIC</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map(c => (
                        <TableRow key={c.localId}>
                          <TableCell className="font-mono text-xs">{c.customerId || "—"}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{c.phone}</TableCell>
                          <TableCell>{c.cnic || "—"}</TableCell>
                          <TableCell>{c.address || "—"}</TableCell>
                          <TableCell className="text-right font-mono">Rs. {c.currentBalance.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={c.balanceType === "payable" ? "destructive" : "default"} className="text-xs">{c.balanceType}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(c.createdAt), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setLedgerCustomer(c)} title="View Ledger"><BookOpen className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <CardHeader><CardTitle className="text-base">{editCustomer ? "Edit Customer" : "Add New Customer"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name *</Label>
                  <Input placeholder="Enter name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input placeholder="03001234567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>CNIC Number</Label>
                  <Input placeholder="Optional" value={form.cnic} onChange={e => setForm(f => ({ ...f, cnic: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input placeholder="Optional" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Opening Balance</Label>
                  <Input type="number" placeholder="0" value={form.openingBalance || ""} onChange={e => setForm(f => ({ ...f, openingBalance: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Balance Type</Label>
                  <Select value={form.balanceType} onValueChange={v => setForm(f => ({ ...f, balanceType: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payable">Payable</SelectItem>
                      <SelectItem value="receivable">Receivable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date (Created At) *</Label>
                  <Input type="date" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editCustomer ? "Update Customer" : "Add Customer"}
                </Button>
                {editCustomer && (
                  <Button variant="outline" onClick={() => { setEditCustomer(null); setForm({ ...emptyForm, createdAt: new Date().toISOString().split("T")[0] }); }}>Cancel</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Customer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will delete "{deleteConfirm?.name}" and all their ledger entries.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
