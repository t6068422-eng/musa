import React, { useEffect, useState } from 'react';
import { 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Activity
} from 'lucide-react';
import { collection, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, ProductionEntry, SaleEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [todayProduction, setTodayProduction] = useState<ProductionEntry[]>([]);
  const [todaySales, setTodaySales] = useState<SaleEntry[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q_products = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(q_products, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const today = startOfDay(new Date());
    const tomorrow = endOfDay(new Date());

    const qProduction = query(
      collection(db, 'production'),
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<=', Timestamp.fromDate(tomorrow))
    );
    const unsubscribeProduction = onSnapshot(qProduction, (snapshot) => {
      setTodayProduction(snapshot.docs.map(doc => doc.data() as ProductionEntry));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    const qSales = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<=', Timestamp.fromDate(tomorrow))
    );
    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      setTodaySales(snapshot.docs.map(doc => doc.data() as SaleEntry));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    // Fetch last 7 days sales for chart
    const sevenDaysAgo = startOfDay(subDays(new Date(), 7));
    const qRecentSales = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(sevenDaysAgo))
    );
    const unsubscribeRecent = onSnapshot(qRecentSales, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as SaleEntry);
      const grouped = data.reduce((acc: any, sale) => {
        const date = format(sale.date.toDate(), 'MMM dd');
        acc[date] = (acc[date] || 0) + sale.total;
        return acc;
      }, {});
      
      const chartData = Object.keys(grouped).map(date => ({
        date,
        amount: grouped[date]
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      setRecentSales(chartData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales (recent)');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeProduction();
      unsubscribeSales();
      unsubscribeRecent();
    };
  }, [user]);

  const lowStockItems = products.filter(p => p.currentStock <= p.minStockLevel);
  const totalProductionToday = todayProduction.reduce((sum, p) => sum + p.quantity, 0);
  const totalSalesToday = todaySales.reduce((sum, s) => sum + s.total, 0);
  const totalAvailableStock = products.reduce((sum, p) => sum + p.currentStock, 0);

  const stats = [
    {
      title: 'Total Products',
      value: products.length,
      icon: Package,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      title: 'Available Stock',
      value: totalAvailableStock.toLocaleString(),
      icon: Activity,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10'
    },
    {
      title: "Today's Sales",
      value: `Rs. ${totalSalesToday.toLocaleString()}`,
      icon: ShoppingCart,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockItems.length,
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-500/10'
    }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Welcome back to MUSA TRADERS management console.</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Sales Revenue (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={recentSales}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `Rs.${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">All items are well stocked.</p>
              ) : (
                lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">{item.currentStock} {item.unit}</p>
                      <p className="text-[10px] text-muted-foreground">Min: {item.minStockLevel}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
