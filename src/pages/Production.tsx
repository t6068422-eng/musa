import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Calendar as CalendarIcon,
  Factory,
  History,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, ProductionEntry } from '../types';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

export default function Production() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionEntry[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { user } = useAuth();

  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 0,
    qtySold: 0
  });

  const [logToDelete, setLogToDelete] = useState<ProductionEntry | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const q = query(collection(db, 'production'), orderBy('date', 'desc'), limit(50));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      setProductionLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionEntry)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeLogs();
    };
  }, [user]);

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    try {
      const batch = writeBatch(db);
      const productRef = doc(db, 'products', logToDelete.productId);
      const product = products.find(p => p.id === logToDelete.productId);
      
      if (product) {
        // Revert the stock change
        batch.update(productRef, { currentStock: product.currentStock - logToDelete.quantity });
      }
      
      batch.delete(doc(db, 'production', logToDelete.id));
      await batch.commit();

      toast.success('Production log deleted and stock reverted');
      setLogToDelete(null);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to delete production log');
    }
  };

  const handleAddProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.productId || (formData.quantity <= 0 && formData.qtySold <= 0)) {
      return toast.error('Please enter a valid quantity for production or sales');
    }

    const selectedProduct = products.find(p => p.id === formData.productId);
    if (!selectedProduct) return;

    try {
      const batch = writeBatch(db);
      const productRef = doc(db, 'products', formData.productId);
      
      const newStock = selectedProduct.currentStock + Number(formData.quantity) - Number(formData.qtySold);
      
      if (newStock < 0) {
        return toast.error("Insufficient stock for the requested sale!");
      }

      const now = Timestamp.now();

      // 1. Log the production if any
      if (formData.quantity > 0) {
        const productionRef = doc(collection(db, 'production'));
        batch.set(productionRef, {
          productId: formData.productId,
          productName: selectedProduct.name,
          quantity: Number(formData.quantity),
          date: now,
          addedBy: user.uid
        });
      }

      // 2. Log the sale if any
      if (formData.qtySold > 0) {
        const saleRef = doc(collection(db, 'sales'));
        batch.set(saleRef, {
          productId: formData.productId,
          productName: selectedProduct.name,
          quantity: Number(formData.qtySold),
          price: 0,
          total: 0,
          date: now,
          soldBy: user.uid
        });
      }

      // 3. Update the product stock
      batch.update(productRef, { currentStock: newStock });
      
      await batch.commit();

      toast.success('Inventory updated successfully');
      setIsAddDialogOpen(false);
      setFormData({ productId: '', quantity: 0, qtySold: 0 });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to update inventory');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Daily Production</h2>
          <p className="text-muted-foreground">Log daily production entries and update stock levels.</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="w-4 h-4" /> Log Production
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Log Daily Production & Sales</DialogTitle>
              <DialogDescription>Select a product and enter the produced and sold quantities.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddProduction} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="product">Product</Label>
                <Select onValueChange={(value: string) => setFormData({...formData, productId: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity Produced</Label>
                  <Input 
                    id="quantity" 
                    type="number" 
                    value={formData.quantity} 
                    onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} 
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="qtySold">Quantity Sold</Label>
                  <Input 
                    id="qtySold" 
                    type="number" 
                    value={formData.qtySold} 
                    onChange={e => setFormData({...formData, qtySold: Number(e.target.value)})} 
                    placeholder="0"
                  />
                </div>
              </div>

              {formData.productId && (
                <div className="p-3 rounded-lg bg-accent/50 border border-border/50">
                  <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    <span>Current Stock</span>
                    <span>New Stock</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-lg font-medium">
                      {products.find(p => p.id === formData.productId)?.currentStock || 0}
                    </span>
                    <div className="h-px w-8 bg-border" />
                    <span className={`text-xl font-bold ${
                      (products.find(p => p.id === formData.productId)?.currentStock || 0) + formData.quantity - formData.qtySold < 0 
                      ? 'text-destructive' 
                      : 'text-primary'
                    }`}>
                      {(products.find(p => p.id === formData.productId)?.currentStock || 0) + formData.quantity - formData.qtySold}
                    </span>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" className="w-full">Update Inventory</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Recent Production Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No production logs yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    productionLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {format(log.date.toDate(), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium">{log.productName}</TableCell>
                        <TableCell>{log.quantity}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:bg-destructive/10 h-10 w-10"
                            onClick={() => setLogToDelete(log)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!logToDelete} onOpenChange={(open) => !open && setLogToDelete(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this production log? The stock will be reverted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setLogToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteLog}>Delete Log</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Factory className="w-5 h-5 text-primary" />
              Quick Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-accent/50 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Today</p>
              <p className="text-2xl font-bold mt-1">
                {productionLogs
                  .filter(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
                  .reduce((sum, log) => sum + log.quantity, 0)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Top Produced (Today)</p>
              {Object.entries(
                productionLogs
                  .filter(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
                  .reduce((acc: any, log) => {
                    acc[log.productName] = (acc[log.productName] || 0) + log.quantity;
                    return acc;
                  }, {})
              ).map(([name, qty]: any) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-semibold">{qty}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
