import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit } from 'firebase/firestore';
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
  isSameDay,
  subDays,
  subWeeks,
  subMonths,
  addDays,
  addWeeks,
  addMonths
} from 'date-fns';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportDate, setReportDate] = useState(new Date());
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
    let chartStart: Date;

    if (period === 'daily') {
      start = startOfDay(reportDate);
      end = endOfDay(reportDate);
      chartStart = startOfDay(subDays(reportDate, 6)); // 7 day trend ending at reportDate
    } else if (period === 'weekly') {
      start = startOfWeek(reportDate);
      end = endOfWeek(reportDate);
      chartStart = startOfWeek(subWeeks(reportDate, 3)); // 4 week trend ending at reportDate
    } else {
      start = startOfMonth(reportDate);
      end = endOfMonth(reportDate);
      chartStart = startOfMonth(reportDate);
    }

    // We fetch from chartStart to encompass both trend and summary cards
    const qProduction = query(collection(db, 'production'), limit(1000));
    const qSales = query(collection(db, 'sales'), limit(1000));

    const unsubscribeProduction = onSnapshot(qProduction, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionEntry));
      setProductionData(data.sort((a, b) => a.date.seconds - b.date.seconds));
    }, (error) => {
      console.error(error);
      toast.error('Failed to load production data');
    });

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleEntry));
      setSalesData(data.sort((a, b) => a.date.seconds - b.date.seconds));
    }, (error) => {
      console.error(error);
      toast.error('Failed to load sales data');
    });

    const q_products = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(q_products, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      console.error(error);
    });

    return () => {
      unsubscribeProduction();
      unsubscribeSales();
      unsubscribeProducts();
    };
  }, [period, reportDate, user]);

  const safeToDate = (timestamp: any): Date => {
    if (!timestamp) return new Date();
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
    return new Date(timestamp);
  };

  const getSummaryRange = () => {
    if (period === 'daily') return { start: startOfDay(reportDate), end: endOfDay(reportDate) };
    if (period === 'weekly') return { start: startOfWeek(reportDate), end: endOfWeek(reportDate) };
    return { start: startOfMonth(reportDate), end: endOfMonth(reportDate) };
  };

  const getTimeLabel = () => {
    if (period === 'daily') return format(reportDate, 'MMM dd, yyyy');
    if (period === 'weekly') {
      const { start, end } = getSummaryRange();
      return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
    }
    return format(reportDate, 'MMMM yyyy');
  };

  const { start: sumStart, end: sumEnd } = getSummaryRange();

  // For charts, we use a broader range
  const chartRange = () => {
    let start: Date;
    if (period === 'daily') start = startOfDay(subDays(reportDate, 6));
    else if (period === 'weekly') start = startOfWeek(subWeeks(reportDate, 3));
    else start = startOfMonth(reportDate);
    return { start, end: endOfDay(reportDate) };
  };
  const { start: cStart, end: cEnd } = chartRange();

  const filteredSalesForSummary = salesData.filter(s => {
    const d = safeToDate(s.date);
    return d >= sumStart && d <= sumEnd;
  });

  const filteredProdForSummary = productionData.filter(p => {
    const d = safeToDate(p.date);
    return d >= sumStart && d <= sumEnd;
  });

  const filteredSalesForChart = salesData.filter(s => {
    const d = safeToDate(s.date);
    return d >= cStart && d <= cEnd;
  });

  const filteredProdForChart = productionData.filter(p => {
    const d = safeToDate(p.date);
    return d >= cStart && d <= cEnd;
  });

  const totalRevenue = filteredSalesForSummary.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalProduction = filteredProdForSummary.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const totalSalesQty = filteredSalesForSummary.reduce((sum, s) => sum + (s.quantity || 0), 0);

  // Prepare chart data for production vs sales
  const getChartData = () => {
    let interval: Date[] = [];
    
    if (period === 'daily') {
      interval = eachDayOfInterval({ start: startOfDay(subDays(reportDate, 6)), end: endOfDay(reportDate) });
    } else if (period === 'weekly') {
      // Last 4 weeks ending at reportDate
      interval = [
        subWeeks(reportDate, 3),
        subWeeks(reportDate, 2),
        subWeeks(reportDate, 1),
        reportDate
      ].map(d => startOfWeek(d));
    } else {
      interval = eachDayOfInterval({ start: startOfMonth(reportDate), end: endOfMonth(reportDate) });
    }

    return interval.map(day => {
      let filteredProd, filteredSales;
      let label = '';

      if (period === 'weekly') {
        const weekEnd = endOfWeek(day);
        filteredProd = filteredProdForChart.filter(p => {
          const d = safeToDate(p.date);
          return d >= day && d <= weekEnd;
        });
        filteredSales = filteredSalesForChart.filter(s => {
          const d = safeToDate(s.date);
          return d >= day && d <= weekEnd;
        });
        label = `Wk ${format(day, 'dd/MM')}`;
      } else {
        filteredProd = filteredProdForChart.filter(p => isSameDay(safeToDate(p.date), day));
        filteredSales = filteredSalesForChart.filter(s => isSameDay(safeToDate(s.date), day));
        label = format(day, period === 'monthly' ? 'dd' : 'EEE');
      }

      return {
        name: label,
        production: filteredProd.reduce((sum, p) => sum + (p.quantity || 0), 0),
        sales: filteredSales.reduce((sum, s) => sum + (s.quantity || 0), 0)
      };
    });
  };

  // Prepare pie chart data for sales by product
  const getSalesByProduct = () => {
    const grouped = filteredSalesForSummary.reduce((acc: any, sale) => {
      acc[sale.productName] = (acc[sale.productName] || 0) + (sale.total || 0);
      return acc;
    }, {});
    return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
  };

  const handlePrev = () => {
    if (period === 'daily') setReportDate(d => subDays(d, 1));
    else if (period === 'weekly') setReportDate(d => subWeeks(d, 1));
    else setReportDate(d => subMonths(d, 1));
  };

  const handleNext = () => {
    if (period === 'daily') setReportDate(d => addDays(d, 1));
    else if (period === 'weekly') setReportDate(d => addWeeks(d, 1));
    else setReportDate(d => addMonths(d, 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-sm md:text-base text-muted-foreground">Deep dive into your production and sales performance.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center justify-between gap-1 bg-card border rounded-lg p-1 min-w-[180px]">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[10px] font-bold uppercase tracking-wider">{getTimeLabel()}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={handleNext}
              disabled={reportDate >= startOfDay(new Date()) && period === 'daily'}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
