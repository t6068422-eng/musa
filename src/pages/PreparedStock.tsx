import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, SaleEntry } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Activity, Image as ImageIcon, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToCSV } from '../lib/export';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PreparedStock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const { user } = useAuth();
  const reportRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = () => {
    if (!reportRef.current) return;
    
    toast.loading('Capturing prepared stock report...');
    toPng(reportRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `PreparedStock_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Stock report captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const unsubscribeSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      setSales(snapshot.docs.map(doc => doc.data() as SaleEntry));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeSales();
    };
  }, [user]);

  const preparedStockData = products.map(product => {
    const productSales = sales
      .filter(s => s.productId === product.id)
      .reduce((sum, s) => sum + s.quantity, 0);
    
    // Prepared Stock = Current Stock + Total Sales (which equals Previous Stock + Total Production)
    const preparedStock = product.currentStock + productSales;

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      currentStock: product.currentStock,
      totalSales: productSales,
      preparedStock: preparedStock,
      unit: product.unit,
      imageUrl: product.imageUrl
    };
  });

  const handleExport = () => {
    const exportData = preparedStockData.map(({ name, category, currentStock, totalSales, preparedStock, unit }) => ({
      'Product Name': name,
      'Category': category,
      'Current Stock': currentStock,
      'Total Sales': totalSales,
      'Prepared Stock': preparedStock,
      'Unit': unit
    }));
    exportToCSV(exportData, 'prepared_stock_report');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Prepared Stock</h2>
          <p className="text-sm md:text-base text-muted-foreground">View total stock prepared (Current Stock + Total Sales).</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={downloadAsImage} variant="outline" className="gap-2 flex-1 sm:flex-none">
            <ImageIcon className="w-4 h-4" /> Download Picture
          </Button>
          <Button onClick={handleExport} variant="outline" className="gap-2 flex-1 sm:flex-none">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Stock Preparation Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="min-w-[120px]">Product Name</TableHead>
                  <TableHead className="min-w-[100px]">Category</TableHead>
                  <TableHead className="text-right min-w-[100px]">Current Stock</TableHead>
                  <TableHead className="text-right min-w-[100px]">Total Sales</TableHead>
                  <TableHead className="text-right font-bold text-primary min-w-[120px]">Prepared Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preparedStockData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="w-10 h-10 rounded-md overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground/50" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell className="text-right">{item.currentStock} {item.unit}</TableCell>
                    <TableCell className="text-right">{item.totalSales} {item.unit}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{item.preparedStock} {item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);
}
