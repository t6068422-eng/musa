import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, SaleEntry } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToCSV } from '../lib/export';

export default function PreparedStock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
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
      unit: product.unit
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Prepared Stock</h2>
          <p className="text-muted-foreground">View total stock prepared (Current Stock + Total Sales).</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Stock Preparation Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
                <TableHead className="text-right font-bold text-primary">Prepared Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preparedStockData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">{item.currentStock} {item.unit}</TableCell>
                  <TableCell className="text-right">{item.totalSales} {item.unit}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{item.preparedStock} {item.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
