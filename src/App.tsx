import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Categories from "@/pages/Categories";
import Suppliers from "@/pages/Suppliers";
import Purchases from "@/pages/Purchases";
import Customers from "@/pages/Customers";
import POS from "@/pages/POS";
import Sales from "@/pages/Sales";
import Payments from "@/pages/Payments";
import Expenses from "@/pages/Expenses";
import Invoices from "@/pages/Invoices";
import Ledger from "@/pages/Ledger";
import DayBook from "@/pages/DayBook";
import PriceList from "@/pages/PriceList";
import SettingsPage from "@/pages/SettingsPage";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/daybook" element={<DayBook />} />
              <Route path="/price-list" element={<PriceList />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
