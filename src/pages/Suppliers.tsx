import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import {
  getAllSuppliers, syncAll, getPendingCount, startAutoSync,
  Supplier,
} from "@/lib/offlineSupplierService";
import AddSupplierForm from "@/components/suppliers/AddSupplierForm";
import SupplierList from "@/components/suppliers/SupplierListTable";
import SupplierLedgerView from "@/components/suppliers/SupplierLedgerView";
import PaySupplierDialog from "@/components/suppliers/PaySupplierOfflineDialog";
import { useToast } from "@/hooks/use-toast";

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

  const loadSuppliers = useCallback(async () => {
    const data = await getAllSuppliers();
    setSuppliers(data);
    const count = await getPendingCount();
    setPendingCount(count);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Supplier Management</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={online ? "default" : "destructive"} className="text-xs gap-1">
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingCount} pending sync
              </Badge>
            )}
          </div>
        </div>
        {online && pendingCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">Supplier List</TabsTrigger>
          <TabsTrigger value="add">Add Supplier</TabsTrigger>
          <TabsTrigger value="ledger">Supplier Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <SupplierList
            suppliers={suppliers}
            onRefresh={loadSuppliers}
            onEdit={(s) => { setEditSupplier(s); setActiveTab("add"); }}
            onPay={(s) => setPaySupplier(s)}
            onViewLedger={(s) => setLedgerSupplier(s)}
          />
        </TabsContent>

        <TabsContent value="add" className="mt-4">
          <AddSupplierForm
            editSupplier={editSupplier}
            onSaved={() => { setEditSupplier(null); setActiveTab("list"); loadSuppliers(); }}
            onCancel={editSupplier ? () => { setEditSupplier(null); setActiveTab("list"); } : undefined}
          />
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          {suppliers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No suppliers yet. Add a supplier first.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select a supplier to view ledger:</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((s) => (
                  <button
                    key={s.localId}
                    onClick={() => setLedgerSupplier(s)}
                    className="rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-foreground">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm font-semibold">Rs. {(s.currentBalance || 0).toLocaleString()}</span>
                      <Badge variant={s.balanceType === "payable" ? "destructive" : "default"} className="text-xs">{s.balanceType}</Badge>
                    </div>
                  </button>
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
