import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Package, Tags, Users, Truck, ShoppingCart,
  CreditCard, FileText, Receipt, BarChart3, BookOpen, CalendarDays,
  Printer, Settings, LogOut,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/suppliers", label: "Supplier Mgmt", icon: Truck },
  { to: "/purchases", label: "Purchases", icon: Receipt },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/pos", label: "POS", icon: ShoppingCart },
  { to: "/sales", label: "Sales", icon: BarChart3 },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/expenses", label: "Expenses", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/ledger", label: "Ledger", icon: BookOpen },
  { to: "/daybook", label: "Day Book", icon: CalendarDays },
  { to: "/price-list", label: "Price List", icon: Printer },
  { to: "/settings", label: "Settings", icon: Settings },
];

const AppSidebar = () => {
  const { logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <ShoppingCart className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-bold text-sidebar-primary">Mobile Shop</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
