import React, { useEffect, useState } from 'react';
import { 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Calendar,
  FileBarChart
} from 'lucide-react';
import { collection, query, where, onSnapshot, Timestamp, orderBy, doc } from 'firebase/firestore';
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
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { startOfDay, endOfDay, subDays, format, startOfMonth } from 'date-fns';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [todayProduction, setTodayProduction] = useState<ProductionEntry[]>([]);
  const [todaySales, setTodaySales] = useState<SaleEntry[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any>(null);
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

    // Fetch Current Monthly Report
    const currentMonthId = format(new Date(), 'yyyy-MM');
    const monthlyRef = doc(db, 'monthlyReports', currentMonthId);
    const unsubscribeMonthly = onSnapshot(monthlyRef, (doc) => {
      if (doc.exists()) {
        setMonthlyStats(doc.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'monthlyReports');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeProduction();
      unsubscribeSales();
      unsubscribeRecent();
      unsubscribeMonthly();
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
        <Card className="lg:col-span-7 border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardHeader className="bg-green-800/10 border-b border-green-800/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-green-800 p-2 rounded-lg">
                  <FileBarChart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">Monthly Report ({format(new Date(), 'MMMM yyyy')})</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Updates automatically after every Save in Stock Control</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-green-800 uppercase tracking-widest">Live Summary</div>
                <div className="text-[10px] text-muted-foreground">Last Save: {monthlyStats?.lastUpdated ? format(monthlyStats.lastUpdated.toDate(), 'HH:mm:ss') : 'N/A'}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {!monthlyStats ? (
              <div className="py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No data for this month yet. Save data in Stock Control to see results.</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-6">
                  <div className="bg-background/40 p-4 rounded-xl border border-border/50">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Financial Performance</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="text-sm">Total Revenue</span>
                        <span className="text-xl font-bold text-green-600">Rs. {monthlyStats.totalRevenue?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="text-sm">Total Sales Qty</span>
                        <span className="text-xl font-bold text-purple-600">{monthlyStats.totalSalesQty?.toLocaleString()} <span className="text-xs font-normal">units</span></span>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-sm">Total Production</span>
                        <span className="text-xl font-bold text-blue-600">{monthlyStats.totalProduction?.toLocaleString()} <span className="text-xs font-normal">units</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/10 p-4 rounded-xl border border-blue-200/20">
                    <div className="flex items-center gap-2 text-blue-800 mb-2">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-bold">Stock Flow Efficiency</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-900">
                      {monthlyStats.totalProduction > 0 
                        ? ((monthlyStats.totalSalesQty / monthlyStats.totalProduction) * 100).toFixed(1)
                        : 0}%
                    </div>
                    <p className="text-[10px] text-blue-800/60 mt-1 italic">Sales-to-Production Ratio (SCR)</p>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Metrics Comparison</h4>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Production', value: monthlyStats.totalProduction, color: '#3b82f6' },
                        { name: 'Sales Qty', value: monthlyStats.totalSalesQty, color: '#a855f7' },
                        { name: 'Revenue (k)', value: monthlyStats.totalRevenue / 1000, color: '#22c55e' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          cursor={{fill: 'rgba(0,0,0,0.05)'}}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {[
                            { color: '#3b82f6' },
                            { color: '#a855f7' },
                            { color: '#22c55e' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Production
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Sales
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" /> Revenue (k)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
