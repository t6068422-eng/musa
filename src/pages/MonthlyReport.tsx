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
import { collection, query, onSnapshot, doc, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MonthlyDetailedEntry, MonthlyReport } from '../types';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
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
import { format, subMonths, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Link } from 'react-router-dom';

export default function MonthlyDetailedReport() {
  const [reportDate, setReportDate] = useState(new Date());
  const [productStats, setProductStats] = useState<MonthlyDetailedEntry[]>([]);
  const [summary, setSummary] = useState<MonthlyReport | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const monthId = format(reportDate, 'yyyy-MM');

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // 1. Fetch Monthly Summary
    const monthlyRef = doc(db, 'monthlyReports', monthId);
    const unsubscribeSummary = onSnapshot(monthlyRef, (docSnap) => {
      if (docSnap.exists()) {
        setSummary(docSnap.data() as MonthlyReport);
      } else {
        setSummary(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `monthlyReports/${monthId}`);
    });

    // 2. Fetch Product Stats Sub-collection
    const statsRef = collection(db, 'monthlyReports', monthId, 'productStats');
    const q = query(statsRef);
    const unsubscribeStats = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as MonthlyDetailedEntry);
      setProductStats(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `monthlyReports/${monthId}/productStats`);
      setLoading(false);
    });

    return () => {
      unsubscribeSummary();
      unsubscribeStats();
    };
  }, [user, monthId]);

  const filteredStats = productStats.filter(s => 
    s.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProduction = filteredStats.reduce((sum, s) => sum + (s.production || 0), 0);
  const totalSalesQty = filteredStats.reduce((sum, s) => sum + (s.qtySold || 0), 0);
  const totalRevenue = filteredStats.reduce((sum, s) => sum + (s.revenue || 0), 0);

  const prevMonth = () => setReportDate(prev => subMonths(prev, 1));
  const nextMonth = () => setReportDate(prev => addMonths(prev, 1));

  const exportToCSV = () => {
    const headers = ['Product', 'Production', 'Qty Sold', 'Price', 'Revenue'];
    const rows = filteredStats.map(s => {
      return [
        s.productName,
        s.production,
        s.qtySold,
        s.price,
        s.revenue
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Monthly_Report_${monthId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-8 w-8 text-green-700" />
            Detailed Monthly Report
          </h2>
          <p className="text-muted-foreground">Aggregated performance per product for the selected month.</p>
        </div>
        <div className="flex items-center gap-2 bg-card border rounded-lg p-1 shadow-sm">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 font-bold text-sm min-w-[140px] text-center">
            {format(reportDate, 'MMMM yyyy')}
          </div>
          <Button variant="ghost" size="icon" onClick={nextMonth} disabled={format(reportDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-green-800 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="h-3 w-3" /> Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">Rs. {totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-blue-800 uppercase tracking-widest flex items-center gap-2">
              <Activity className="h-3 w-3" /> Total Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{totalProduction.toLocaleString()} units</div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-purple-800 uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart className="h-3 w-3" /> Total Items Sold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{totalSalesQty.toLocaleString()} items</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-orange-800 uppercase tracking-widest flex items-center gap-2">
              <Package className="h-3 w-3" /> Active Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">{filteredStats.length}</div>
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
          <Button variant="outline" className="flex-1 md:flex-none gap-2" onClick={exportToCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Link to="/stock-control" className="flex-1 md:flex-none">
            <Button variant="ghost" className="w-full gap-2">
              Back to Stock Control
            </Button>
          </Link>
        </div>
      </div>

      <Card className="border-border/50 bg-card/10 backdrop-blur-sm overflow-hidden shadow-xl">
        <div className="bg-[#38761d] text-white p-4 font-bold flex justify-between items-center border-b-2 border-green-900">
          <span className="tracking-widest uppercase text-sm">Monthly Performance Sheet</span>
          <span className="text-xs opacity-80">{format(reportDate, 'MMMM yyyy')}</span>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#93c47d] hover:bg-[#93c47d] border-b-2 border-green-800">
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
                      Generating Monthly Report...
                    </TableCell>
                  </TableRow>
                ) : filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                      No data found for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((stat) => (
                    <TableRow key={stat.productId} className="hover:bg-green-50/30 border-b border-border/50">
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
  );
}
