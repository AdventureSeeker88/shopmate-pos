import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff } from "lucide-react";
import logo from "@/assets/logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isOffline } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      toast({
        title: "Login Failed",
        description: isOffline ? "Invalid offline credentials." : "Invalid email or password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logo} alt="Saim Mobile" className="mx-auto mb-2 h-20 w-20 rounded-full object-cover" />
          <CardTitle className="text-2xl">Saim Mobile</CardTitle>
          <CardDescription>Sign in to manage your shop</CardDescription>
          <Badge variant={isOffline ? "destructive" : "default"} className="mx-auto mt-2 gap-1">
            {isOffline ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            {isOffline ? "Offline Mode" : "Online"}
          </Badge>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@shop.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            {isOffline && (
              <p className="text-xs text-muted-foreground text-center">
                Using offline credentials. Change in Settings.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
