import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Calendar as CalendarIcon,
  Factory,
  History,
  Trash2,
  Image as ImageIcon,
  Package
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
  writeBatch,
  getDoc,
  setDoc
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
import { toPng } from 'html-to-image';

export default function Production() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionEntry[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { user, quotaExceeded } = useAuth();
  const productionRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = async () => {
    if (!productionRef.current) return;
    
    toast.loading('Capturing production status...');
    try {
      const element = productionRef.current;
      const dataUrl = await toPng(element, { 
        backgroundColor: '#f8fafc', 
        cacheBust: true,
        pixelRatio: 2,
        width: element.scrollWidth,
        height: element.scrollHeight,
        style: {
          padding: '20px',
          borderRadius: '12px'
        }
      });
      
      const link = document.createElement('a');
      link.download = `Production_${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      link.click();
      toast.dismiss();
      toast.success('Production status captured');
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error('Failed to capture image');
    }
  };

  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 0,
    qtySold: 0,
    unitType: 'piece' as 'ctn' | 'piece',
    manualDate: format(new Date(), "yyyy-MM-dd")
  });

  const [logToDelete, setLogToDelete] = useState<ProductionEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q_products = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(q_products, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(data.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const q = query(collection(db, 'production'), limit(50));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionEntry));
      setProductionLogs(data.sort((a, b) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateB - dateA;
      }));
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
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      const productRef = doc(db, 'products', logToDelete.productId);
      const product = products.find(p => p.id === logToDelete.productId);
      
      if (product) {
        // Revert the stock change
        batch.update(productRef, { currentStock: product.currentStock - logToDelete.quantity });
      }

      // Update Stock Control History if it exists for this day (to keep reports in sync)
      const prodDate = logToDelete.date.toDate();
      const dayId = format(prodDate, 'yyyy-MM-dd');
      const historyRef = doc(db, 'stockControlHistory', dayId);
      const historySnap = await getDoc(historyRef);
      
      if (historySnap.exists()) {
        const historyData = historySnap.data();
        const updatedEntries = (historyData.entries || []).map((e: any) => {
          if (e.productId === logToDelete.productId) {
            return {
              ...e,
              production: Math.max(0, (e.production || 0) - logToDelete.quantity)
            };
          }
          return e;
        });
        batch.update(historyRef, { entries: updatedEntries });
      }
      
      // Also Update Stock Control Draft if it's today
      const isToday = dayId === format(new Date(), 'yyyy-MM-dd');
      if (isToday) {
        const draftRef = doc(db, 'settings', 'stockControlDraft');
        const draftSnap = await getDoc(draftRef);
        if (draftSnap.exists()) {
          const draftData = draftSnap.data();
          const draftEntries = { ...(draftData.entries || {}) };
          if (draftEntries[logToDelete.productId]) {
            const entry = draftEntries[logToDelete.productId];
            const newProd = Math.max(0, (entry.production || 0) - logToDelete.quantity);
            draftEntries[logToDelete.productId] = {
              ...entry,
              production: newProd,
              maxProduction: newProd // Reset maxProduction to match the decreased total
            };
            batch.set(draftRef, { entries: draftEntries, lastUpdated: Timestamp.now() }, { merge: true });
            
            // Local storage sync
            try {
              localStorage.setItem(`stockDraft_${user.uid}`, JSON.stringify({ entries: draftEntries, timestamp: Date.now() }));
              window.dispatchEvent(new StorageEvent('storage', { key: `stockDraft_${user.uid}`, newValue: localStorage.getItem(`stockDraft_${user.uid}`) }));
            } catch (e) {
              console.error('Failed to sync draft to localStorage:', e);
            }
          }
        }
      }
      
      batch.delete(doc(db, 'production', logToDelete.id));
      await batch.commit();

      toast.success('Production log deleted from everywhere successfully');
      setLogToDelete(null);
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'resource-exhausted') {
        toast.error('Quota Limit: Cannot delete from cloud.');
      } else {
        toast.error('Failed to delete production log');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
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

      const selectedDate = new Date(formData.manualDate);
      // Set to current time if the date is today, otherwise use the selected date at noon
      const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      const timestampDate = isToday ? new Date() : new Date(selectedDate.setHours(12, 0, 0, 0));
      const firebaseTimestamp = Timestamp.fromDate(timestampDate);

      // 1. Log the production if any
      if (formData.quantity > 0) {
        const productionRef = doc(collection(db, 'production'));
        batch.set(productionRef, {
          productId: formData.productId,
          productName: selectedProduct.name,
          quantity: Number(formData.quantity),
          unitType: formData.unitType,
          date: firebaseTimestamp,
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
          unitType: formData.unitType,
          price: 0,
          total: 0,
          date: firebaseTimestamp,
          soldBy: user.uid
        });
      }

      // 3. Update the product stock
      batch.update(productRef, { 
        currentStock: newStock,
        availableStock: Math.max(0, (selectedProduct.availableStock || 0) + Number(formData.quantity) - Number(formData.qtySold))
      });
      
      // 4. Sync with Stock Control Draft if today
      if (isToday) {
        const draftRef = doc(db, 'settings', 'stockControlDraft');
        const draftSnap = await getDoc(draftRef);
        const draftData = draftSnap.exists() ? draftSnap.data() : { entries: {} };
        const draftEntries = { ...(draftData.entries || {}) };
        
        const currentEntry = draftEntries[formData.productId] || {
          productId: formData.productId,
          production: 0,
          qtySold: 0,
          maxProduction: 0,
          price: selectedProduct.price || 0,
          preparedStock: selectedProduct.currentStock,
          customFields: {}
        };

        // We only ADD to the draft production/sold values
        const updatedEntry = {
          ...currentEntry,
          production: (currentEntry.production || 0) + Number(formData.quantity),
          qtySold: (currentEntry.qtySold || 0) + Number(formData.qtySold)
        };
        
        // Ensure maxProduction tracks the highest value
        updatedEntry.maxProduction = Math.max(Number(currentEntry.maxProduction || 0), updatedEntry.production);
        
        draftEntries[formData.productId] = updatedEntry;
        
        await setDoc(draftRef, { 
          entries: draftEntries, 
          lastUpdated: Timestamp.now(),
          updatedBy: user.uid
        }, { merge: true });

        // Local storage sync for cross-tab immediate update
        try {
          localStorage.setItem(`stockDraft_${user.uid}`, JSON.stringify({
            entries: draftEntries,
            timestamp: Date.now()
          }));
          window.dispatchEvent(new StorageEvent('storage', {
            key: `stockDraft_${user.uid}`,
            newValue: localStorage.getItem(`stockDraft_${user.uid}`)
          }));
        } catch (e) {
          console.error('Failed to sync draft to localStorage:', e);
        }
      }

      await batch.commit();

      toast.success('Inventory updated successfully');
      setIsAddDialogOpen(false);
      setFormData({ 
        productId: '', 
        quantity: 0, 
        qtySold: 0, 
        unitType: 'piece',
        manualDate: format(new Date(), "yyyy-MM-dd") 
      });
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
        
        <div className="flex items-center gap-2">
          <Button onClick={downloadAsImage} variant="outline" className="gap-2">
            <ImageIcon className="w-4 h-4" /> Download Picture
          </Button>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    value={formData.manualDate} 
                    onChange={e => setFormData({...formData, manualDate: e.target.value})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unitType">Unit Type</Label>
                  <Select 
                    value={formData.unitType} 
                    onValueChange={(val: 'ctn' | 'piece') => setFormData({...formData, unitType: val})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unit Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="piece">Piece (PCS)</SelectItem>
                      <SelectItem value="ctn">Carton (CTN)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
    </div>

    <div ref={productionRef} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Recent Production Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-6">
            <div className="overflow-hidden border rounded-lg">
              <div className="overflow-x-auto scrollbar-custom">
                <div className="max-h-[500px] overflow-y-auto scrollbar-custom">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-20 shadow-md border-b">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[120px] bg-background font-bold text-foreground py-4">Date</TableHead>
                        <TableHead className="w-[40px] bg-background"></TableHead>
                        <TableHead className="min-w-[150px] bg-background font-bold text-foreground py-4">Product</TableHead>
                        <TableHead className="bg-background font-bold text-foreground py-4">Unit</TableHead>
                        <TableHead className="bg-background font-bold text-foreground py-4 text-right">Quantity</TableHead>
                        <TableHead className="text-right bg-background font-bold text-foreground py-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                <TableBody>
                  {productionLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No production logs yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {productionLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {format(log.date.toDate(), 'MMM dd, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <div className="w-8 h-8 rounded shrink-0 overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center">
                              {products.find(p => p.id === log.productId)?.imageUrl ? (
                                <img src={products.find(p => p.id === log.productId)?.imageUrl} alt={log.productName} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-4 h-4 text-muted-foreground/40" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{log.productName}</TableCell>
                          <TableCell>
                            <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {log.unitType || 'piece'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-bold">{log.quantity}</TableCell>
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
                      ))}
                      {/* Grand Total Row */}
                      <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                        <TableCell colSpan={4} className="text-right py-4 uppercase text-[10px] tracking-widest text-muted-foreground">
                          Grand Total (Visible)
                        </TableCell>
                        <TableCell className="text-primary tabular-nums text-right text-lg">
                          {productionLogs.reduce((sum, log) => sum + log.quantity, 0)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
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
              <Button variant="outline" onClick={() => setLogToDelete(null)} disabled={isDeleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteLog} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Log'}
              </Button>
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
  </div>
);
}
