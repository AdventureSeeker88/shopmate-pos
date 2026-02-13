import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Wifi, WifiOff, Users, Plus, BookOpen, TrendingUp, TrendingDown } from "lucide-react";
import {
  getAllSuppliers, syncAll, getPendingCount, startAutoSync,
  Supplier,
} from "@/lib/offlineSupplierService";
import AddSupplierForm from "@/components/suppliers/AddSupplierForm";
import SupplierList from "@/components/suppliers/SupplierListTable";
import SupplierLedgerView from "@/components/suppliers/SupplierLedgerView";
import PaySupplierDialog from "@/components/suppliers/PaySupplierOfflineDialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const Suppliers = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllSuppliers();
      setSuppliers(data);
      const count = await getPendingCount();
      setPendingCount(count);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startAutoSync();
    loadSuppliers();

    const handleOnline = () => { setOnline(true); loadSuppliers(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadSuppliers]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await syncAll();
      await loadSuppliers();
      toast({ title: "Sync Complete", description: "All data synced to Firebase" });
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Stats
  const totalPayable = suppliers.filter(s => s.balanceType === "payable").reduce((sum, s) => sum + (s.currentBalance || 0), 0);
  const totalReceivable = suppliers.filter(s => s.balanceType === "receivable").reduce((sum, s) => sum + (s.currentBalance || 0), 0);

  // Ledger view
  if (ledgerSupplier) {
    return (
      <div className="space-y-4">
        <SupplierLedgerView supplier={ledgerSupplier} onBack={() => { setLedgerSupplier(null); loadSuppliers(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Supplier Management</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={online ? "default" : "destructive"} className="text-xs gap-1 px-2.5 py-0.5">
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs px-2.5 py-0.5">
                {pendingCount} pending sync
              </Badge>
            )}
          </div>
        </div>
        {online && pendingCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing} className="shrink-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Suppliers</p>
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : suppliers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-destructive/10 p-3">
              <TrendingUp className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Payable</p>
              <p className="text-2xl font-bold text-foreground">Rs. {loading ? "—" : totalPayable.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3">
              <TrendingDown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Receivable</p>
              <p className="text-2xl font-bold text-foreground">Rs. {loading ? "—" : totalReceivable.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="list" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Suppliers</span>
          </TabsTrigger>
          <TabsTrigger value="add" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{editSupplier ? "Edit" : "Add New"}</span>
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Ledger</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : (
            <SupplierList
              suppliers={suppliers}
              onRefresh={loadSuppliers}
              onEdit={(s) => { setEditSupplier(s); setActiveTab("add"); }}
              onPay={(s) => setPaySupplier(s)}
              onViewLedger={(s) => setLedgerSupplier(s)}
            />
          )}
        </TabsContent>

        <TabsContent value="add" className="mt-6">
          <AddSupplierForm
            editSupplier={editSupplier}
            onSaved={() => { setEditSupplier(null); setActiveTab("list"); loadSuppliers(); }}
            onCancel={editSupplier ? () => { setEditSupplier(null); setActiveTab("list"); } : undefined}
          />
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
            </div>
          ) : suppliers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">No suppliers yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add a supplier first to view their ledger.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveTab("add")}>
                  <Plus className="h-4 w-4 mr-1" /> Add Supplier
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a supplier to view their complete ledger:</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((s) => (
                  <Card
                    key={s.localId}
                    className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all duration-200 border-border/60"
                    onClick={() => setLedgerSupplier(s)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{s.name}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{s.phone}</p>
                        </div>
                        <Badge variant={s.syncStatus === "synced" ? "default" : "secondary"} className="text-[10px] px-1.5">
                          {s.syncStatus === "synced" ? "✓" : "⏳"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                        <span className="text-base font-bold text-foreground">Rs. {(s.currentBalance || 0).toLocaleString()}</span>
                        <Badge variant={s.balanceType === "payable" ? "destructive" : "default"} className="text-[10px]">{s.balanceType}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PaySupplierDialog
        open={!!paySupplier}
        onOpenChange={(open) => { if (!open) setPaySupplier(null); }}
        supplier={paySupplier}
        onPaid={loadSuppliers}
      />
    </div>
  );
};

export default Suppliers;