import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package
} from 'lucide-react';
import { collection, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { ProductionEntry, SaleEntry, Product } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  format,
  eachDayOfInterval,
  isSameDay
} from 'date-fns';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [productionData, setProductionData] = useState<ProductionEntry[]>([]);
  const [salesData, setSalesData] = useState<SaleEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const { user } = useAuth();
  const reportRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = () => {
    if (!reportRef.current) return;
    
    toast.loading('Exporting report as image...');
    toPng(reportRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `Report_${period}_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Report downloaded as picture');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to export image');
      });
  };

  useEffect(() => {
    if (!user) return;
    let start: Date, end: Date;
    const now = new Date();

    if (period === 'daily') {
      start = startOfDay(now);
      end = endOfDay(now);
    } else if (period === 'weekly') {
      start = startOfWeek(now);
      end = endOfWeek(now);
    } else {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    const qProduction = query(
      collection(db, 'production'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );

    const qSales = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );

    const unsubscribeProduction = onSnapshot(qProduction, (snapshot) => {
      setProductionData(snapshot.docs.map(doc => doc.data() as ProductionEntry));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      setSalesData(snapshot.docs.map(doc => doc.data() as SaleEntry));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const q_products = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(q_products, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => {
      unsubscribeProduction();
      unsubscribeSales();
      unsubscribeProducts();
    };
  }, [period, user]);

  const totalRevenue = salesData.reduce((sum, s) => sum + s.total, 0);
  const totalProduction = productionData.reduce((sum, p) => sum + p.quantity, 0);
  const totalSalesQty = salesData.reduce((sum, s) => sum + s.quantity, 0);

  // Prepare chart data for production vs sales
  const getChartData = () => {
    const now = new Date();
    let interval: Date[] = [];
    
    if (period === 'daily') {
      // For daily, we might want to show hours, but let's stick to days for consistency
      interval = [now];
    } else if (period === 'weekly') {
      interval = eachDayOfInterval({ start: startOfWeek(now), end: endOfWeek(now) });
    } else {
      interval = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
    }

    return interval.map(day => {
      const dayProd = productionData.filter(p => isSameDay(p.date.toDate(), day)).reduce((sum, p) => sum + p.quantity, 0);
      const daySales = salesData.filter(s => isSameDay(s.date.toDate(), day)).reduce((sum, s) => sum + s.quantity, 0);
      return {
        name: format(day, period === 'monthly' ? 'dd' : 'EEE'),
        production: dayProd,
        sales: daySales
      };
    });
  };

  // Prepare pie chart data for sales by product
  const getSalesByProduct = () => {
    const grouped = salesData.reduce((acc: any, sale) => {
      acc[sale.productName] = (acc[sale.productName] || 0) + sale.total;
      return acc;
    }, {});
    return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-sm md:text-base text-muted-foreground">Deep dive into your production and sales performance.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Tabs value={period} onValueChange={(v: any) => setPeriod(v)} className="w-full sm:w-[300px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" className="hidden sm:flex" onClick={downloadAsImage}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="sm:hidden gap-2" onClick={downloadAsImage}>
            <Download className="w-4 h-4" /> Download Picture
          </Button>
        </div>
      </div>

      <div className="space-y-6" ref={reportRef}>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              For the selected {period} period
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProduction.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Units produced in total
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Volume</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSalesQty.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Units sold in total
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Stock Change</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalProduction - totalSalesQty).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Production minus Sales
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Production vs Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getChartData()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Bar dataKey="production" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Production" />
                  <Bar dataKey="sales" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Revenue by Product</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getSalesByProduct()}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {getSalesByProduct().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `Rs. ${value.toLocaleString()}`}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);
}
