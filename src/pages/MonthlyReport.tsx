import React, { useEffect, useState } from 'react';
import { 
  FileBarChart, 
  Search, 
  Download, 
  Calendar,
  Package,
  Activity,
  ShoppingCart,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { collection, query, onSnapshot, doc, getDocs, orderBy, Timestamp, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MonthlyDetailedEntry, MonthlyReport, Product } from '../types';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { safeToDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  format, 
  subMonths, 
  addMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek,
  subDays,
  addDays,
  subWeeks,
  addWeeks
} from 'date-fns';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

export default function DetailedReports() {
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [reportDate, setReportDate] = useState(new Date());
  const [productStats, setProductStats] = useState<MonthlyDetailedEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [summary, setSummary] = useState<MonthlyReport | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const reportAreaRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = async () => {
    if (!reportAreaRef.current) return;
    
    toast.loading('Capturing report image...');
    try {
      const element = reportAreaRef.current;
      const dataUrl = await toPng(element, { 
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
        width: element.scrollWidth,
        height: element.scrollHeight,
        style: {
          borderRadius: '0px',
          margin: '0',
          padding: '20px'
        }
      });
      
      const link = document.createElement('a');
      link.download = `DetailedReport_${reportType}_${format(reportDate, 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      link.click();
      toast.dismiss();
      toast.success('Report image downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error('Failed to capture report');
    }
  };

  const getRange = () => {
    if (reportType === 'daily') {
      return { start: startOfDay(reportDate), end: endOfDay(reportDate) };
    }
    if (reportType === 'weekly') {
      return { start: startOfWeek(reportDate), end: endOfWeek(reportDate) };
    }
    return { start: startOfMonth(reportDate), end: endOfMonth(reportDate) };
  };

  const getTimeLabel = () => {
    if (reportType === 'daily') return format(reportDate, 'MMM dd, yyyy');
    if (reportType === 'weekly') {
      const { start, end } = getRange();
      return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
    }
    return format(reportDate, 'MMMM yyyy');
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const qProducts = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(qProducts, (productSnapshot) => {
      const data = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(data.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)));
    });

    const qHistory = query(
      collection(db, 'stockControlHistory'),
      limit(500)
    );

    const unsubscribeHistory = onSnapshot(qHistory, (historySnapshot) => {
      setHistory(historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockControlHistory');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeHistory();
    };
  }, [user]);

  // Derived state from products and history
  useEffect(() => {
    if (products.length === 0 || history.length === 0) {
      if (history.length === 0) setLoading(false);
      return;
    }
    
    setLoading(true);
    const { start, end } = getRange();
    
    const historyDocs = history.filter(h => {
       const d = safeToDate(h.date);
       return d >= start && d <= end;
    }).sort((a, b) => b.date.seconds - a.date.seconds);

    const productMap: Record<string, MonthlyDetailedEntry> = {};
    let totalRev = 0;
    let totalProd = 0;
    let totalSales = 0;

    historyDocs.forEach(h => {
      (h.entries || []).forEach((e: any) => {
        if (!productMap[e.productId]) {
          const product = products.find(p => p.id === e.productId);
          productMap[e.productId] = {
            productId: e.productId,
            productName: e.productName || 'Unknown',
            production: 0,
            qtySold: 0,
            revenue: 0,
            price: e.price,
            preparedStock: 0,
            currentStock: 0,
            imageUrl: e.imageUrl || (product as any)?.imageUrl || ''
          };
        }
        productMap[e.productId].production += (e.production || 0);
        productMap[e.productId].qtySold += (e.qtySold || 0);
        productMap[e.productId].revenue += ((e.qtySold || 0) * (e.price || 0));
        
        totalRev += ((e.qtySold || 0) * (e.price || 0));
        totalProd += (e.production || 0);
        totalSales += (e.qtySold || 0);
      });
    });

    const sortedStats = products
      .map(p => productMap[p.id])
      .filter(Boolean);

    setProductStats(sortedStats);
    
    setSummary({
      month: format(reportDate, 'yyyy-MM'),
      totalRevenue: totalRev,
      totalProduction: totalProd,
      totalSalesQty: totalSales,
      lastUpdated: historyDocs.length > 0 ? historyDocs[0].date : Timestamp.now(),
      saveCount: historyDocs.length
    });
    setLoading(false);
  }, [products, history, reportDate, reportType]);

  const filteredStats = productStats.filter(s => 
    s.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProduction = filteredStats.reduce((sum, s) => sum + (s.production || 0), 0);
  const totalSalesQty = filteredStats.reduce((sum, s) => sum + (s.qtySold || 0), 0);
  const totalRevenue = filteredStats.reduce((sum, s) => sum + (s.revenue || 0), 0);

  const prev = () => {
    if (reportType === 'daily') setReportDate(d => subDays(d, 1));
    else if (reportType === 'weekly') setReportDate(d => subWeeks(d, 1));
    else setReportDate(d => subMonths(d, 1));
  };
  const next = () => {
    if (reportType === 'daily') setReportDate(d => addDays(d, 1));
    else if (reportType === 'weekly') setReportDate(d => addWeeks(d, 1));
    else setReportDate(d => addMonths(d, 1));
  };

  const exportToCSV = () => {
    const headers = ['Product', 'Production', 'Qty Sold', 'Price', 'Revenue'];
    const rows = filteredStats.map(s => [s.productName, s.production, s.qtySold, s.price, s.revenue]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${reportType}_Report_${format(reportDate, 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-8 w-8 text-green-700" />
            Performance Reports
          </h2>
          <p className="text-muted-foreground italic text-xs mt-1">Note: Detailed reports are generated from saved Stock Sheets in Stock Control.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
          <Tabs value={reportType} onValueChange={(v: any) => setReportType(v)} className="w-full sm:w-[300px]">
            <TabsList className="grid w-full grid-cols-3 bg-secondary/30">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center justify-between gap-2 bg-card border rounded-lg p-1 shadow-sm min-w-[200px]">
            <Button variant="ghost" size="icon" onClick={prev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-2 font-bold text-sm text-center">
              {getTimeLabel()}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={next} 
              disabled={reportDate >= new Date()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6" ref={reportAreaRef}>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-2 text-green-800">
            <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="h-3 w-3" /> Total Revenue
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2 text-blue-800">
            <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Activity className="h-3 w-3" /> Total Production
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProduction.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-2 text-purple-800">
            <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart className="h-3 w-3" /> Total Items Sold
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSalesQty.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-2 text-orange-800">
            <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Package className="h-3 w-3" /> Active Products
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredStats.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Filter by product name..." 
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" className="flex-1 md:flex-none gap-2 border-primary text-primary hover:bg-primary/5" onClick={downloadAsImage}>
            <Download className="h-4 w-4" /> Download Picture
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none gap-2" onClick={exportToCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Link to="/stock-control" className="flex-1 md:flex-none">
            <Button variant="ghost" className="w-full gap-2 font-medium">
              Back to Stock Control
            </Button>
          </Link>
        </div>
      </div>

        <Card className="border-border/50 bg-card/10 backdrop-blur-sm overflow-hidden shadow-xl">
          <div className="bg-[#38761d] text-white p-4 font-bold flex justify-between items-center border-b-2 border-green-900">
            <span className="tracking-widest uppercase text-sm">{reportType} Performance Sheet</span>
            <span className="text-xs opacity-80">{getTimeLabel()}</span>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#93c47d] hover:bg-[#93c47d] border-b-2 border-green-800">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="text-black font-bold border-r border-green-800/20">Product</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800/20">Production</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800/20">Qty Sold</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800/20">Price</TableHead>
                  <TableHead className="text-black font-bold text-center">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                      <Activity className="h-8 w-8 animate-spin mx-auto mb-2 opacity-20" />
                      Generating {reportType} Report...
                    </TableCell>
                  </TableRow>
                ) : filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                      No data found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((stat) => (
                    <TableRow key={stat.productId} className="hover:bg-green-50/30 border-b border-border/50">
                      <TableCell>
                        <div className="w-8 h-8 rounded shrink-0 overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center mx-auto">
                          {stat.imageUrl ? (
                            <img src={stat.imageUrl} alt={stat.productName} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold border-r border-border/50">{stat.productName}</TableCell>
                      <TableCell className="text-center border-r border-border/50 font-bold text-blue-700">
                        {stat.production}
                      </TableCell>
                      <TableCell className="text-center border-r border-border/50 font-bold text-purple-700">
                        {stat.qtySold}
                      </TableCell>
                      <TableCell className="text-center border-r border-border/50 text-muted-foreground">
                        Rs. {stat.price}
                      </TableCell>
                      <TableCell className="text-center font-bold text-green-700">
                        Rs. {stat.revenue.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!loading && filteredStats.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell></TableCell>
                    <TableCell className="border-r border-border/50">TOTALS</TableCell>
                    <TableCell className="text-center border-r border-border/50 text-blue-800">{totalProduction.toLocaleString()}</TableCell>
                    <TableCell className="text-center border-r border-border/50 text-purple-800">{totalSalesQty.toLocaleString()}</TableCell>
                    <TableCell className="text-center border-r border-border/50">-</TableCell>
                    <TableCell className="text-center font-bold text-[#38761d]">Rs. {totalRevenue.toLocaleString()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
