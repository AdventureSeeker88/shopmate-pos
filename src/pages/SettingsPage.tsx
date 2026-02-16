import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getShopSettings, saveShopSettings, ShopSettings } from "@/lib/shopSettings";
import { getOfflineCredentials, saveOfflineCredentials, OfflineCredentials } from "@/lib/offlineAuth";
import { Store, Printer, Save, Lock } from "lucide-react";

const SettingsPage = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ShopSettings>(getShopSettings());
  const [creds, setCreds] = useState<OfflineCredentials>(getOfflineCredentials());

  useEffect(() => {
    setSettings(getShopSettings());
    setCreds(getOfflineCredentials());
  }, []);

  const handleSave = () => {
    saveShopSettings(settings);
    toast({ title: "Settings saved", description: "Shop settings updated successfully." });
  };

  const update = (key: keyof ShopSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your shop details for invoices and receipts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shop Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> Shop Information</CardTitle>
            <CardDescription>These details appear on all printed invoices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Shop Name *</Label>
              <Input value={settings.shopName} onChange={e => update("shopName", e.target.value)} placeholder="e.g. Saim Mobile" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={settings.phone} onChange={e => update("phone", e.target.value)} placeholder="+92 300 1234567" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={settings.email} onChange={e => update("email", e.target.value)} placeholder="shop@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={settings.address} onChange={e => update("address", e.target.value)} placeholder="Shop No. 5, Main Market, City" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Tagline (optional)</Label>
              <Input value={settings.tagline} onChange={e => update("tagline", e.target.value)} placeholder="e.g. Your Trusted Mobile Partner" />
            </div>
            <div className="space-y-2">
              <Label>Invoice Footer Message</Label>
              <Input value={settings.invoiceMessage} onChange={e => update("invoiceMessage", e.target.value)} placeholder="e.g. Thank you for your business!" />
            </div>
          </CardContent>
        </Card>

        {/* Regional Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Printer className="h-4 w-4" /> Invoice Preview</CardTitle>
            <CardDescription>How your invoice header will look</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={settings.currency} onValueChange={v => update("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PKR">₨ PKR</SelectItem>
                  <SelectItem value="INR">₹ INR</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Live preview */}
            <div className="rounded-lg border p-4 bg-white text-black space-y-1 text-center">
              <p className="text-xl font-extrabold tracking-wide">{settings.shopName || "Shop Name"}</p>
              {settings.address && <p className="text-xs text-gray-500">{settings.address}</p>}
              {settings.phone && <p className="text-xs text-gray-500">Phone: {settings.phone}</p>}
              {settings.email && <p className="text-xs text-gray-500">Email: {settings.email}</p>}
              {settings.tagline && <p className="text-xs italic text-gray-400 mt-1">{settings.tagline}</p>}
              <div className="border-t border-gray-300 mt-3 pt-2">
                <p className="text-sm font-bold tracking-widest uppercase">Sale Invoice</p>
              </div>
              {settings.invoiceMessage && (
                <div className="border-t border-dashed border-gray-300 mt-3 pt-2">
                  <p className="text-xs text-gray-500">{settings.invoiceMessage}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offline Login Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Offline Login</CardTitle>
            <CardDescription>Credentials used when internet is not available</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={creds.email} onChange={e => setCreds(p => ({ ...p, email: e.target.value }))} placeholder="offline@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={creds.password} onChange={e => setCreds(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => {
              saveOfflineCredentials(creds);
              toast({ title: "Offline credentials updated", description: "New offline login saved." });
            }}>
              <Lock className="h-4 w-4" /> Save Offline Login
            </Button>
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleSave} size="lg" className="gap-2">
        <Save className="h-4 w-4" /> Save Settings
      </Button>
    </div>
  );
};

export default SettingsPage;
