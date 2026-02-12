import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, CreditCard, TrendingUp } from "lucide-react";

const stats = [
  { title: "Today's Sales", value: "₨ 0", icon: ShoppingCart, color: "text-green-600" },
  { title: "Total Stock", value: "0", icon: Package, color: "text-blue-600" },
  { title: "Pending Payments", value: "₨ 0", icon: CreditCard, color: "text-orange-600" },
  { title: "Total Profit", value: "₨ 0", icon: TrendingUp, color: "text-purple-600" },
];

const Dashboard = () => {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-foreground">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
