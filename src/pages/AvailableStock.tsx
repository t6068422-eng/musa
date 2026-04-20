import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Package, Search, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '../context/AuthContext';
import { exportToCSV } from '../lib/export';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AvailableStock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();
  const stockRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = () => {
    if (!stockRef.current) return;
    
    toast.loading('Capturing stock report...');
    toPng(stockRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `AvailableStock_${format(new Date(), 'yyyy-MM-dd')}.png`;
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
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, [user]);

  const getStatus = (product: Product) => {
    if (product.currentStock <= 0) return { label: 'Out of Stock', variant: 'destructive' as const };
    if (product.currentStock <= product.minStockLevel) return { label: 'Low Stock', variant: 'outline' as const };
    return { label: 'In Stock', variant: 'secondary' as const };
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const exportData = filteredProducts.map(p => ({
      'Product Name': p.name,
      'Category': p.category,
      'Current Stock': p.currentStock,
      'Unit': p.unit,
      'Status': getStatus(p).label
    }));
    exportToCSV(exportData, 'available_stock_report');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Available Stock</h2>
          <p className="text-sm md:text-base text-muted-foreground">Final stock display and inventory status.</p>
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

      <div ref={stockRef} className="space-y-6">
        <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search stock..." 
          className="pl-10 bg-card/50 h-11" 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Inventory Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Product Name</TableHead>
                  <TableHead className="min-w-[120px]">Category</TableHead>
                  <TableHead className="text-right min-w-[120px]">Current Stock</TableHead>
                  <TableHead className="text-center min-w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const status = getStatus(product);
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="text-right font-bold">
                        {product.currentStock} {product.unit}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className={status.label === 'Low Stock' ? 'text-orange-500 border-orange-500/50' : ''}>
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);
}
