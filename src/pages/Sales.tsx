import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingCart,
  History,
  DollarSign,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy,
  limit,
  writeBatch,
  doc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, SaleEntry, Client } from '../types';
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
import { Printer } from 'lucide-react';

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [salesLogs, setSalesLogs] = useState<SaleEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleEntry | null>(null);
  const { user } = useAuth();

  const handlePrintInvoice = (sale: SaleEntry) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Invoice - ${sale.id}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .total { text-align: right; font-size: 1.2em; font-weight: bold; }
            .footer { margin-top: 50px; text-align: center; font-size: 0.8em; color: #777; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MUSA TRADERS</h1>
            <p>Inventory Management System Invoice</p>
          </div>
          <div class="invoice-details">
            <div>
              <strong>Invoice To:</strong><br>
              Cash Customer
            </div>
            <div>
              <strong>Invoice #:</strong> ${sale.id.slice(0, 8).toUpperCase()}<br>
              <strong>Date:</strong> ${format(sale.date.toDate(), 'PPP')}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${sale.productName}</td>
                <td>${sale.quantity}</td>
                <td>Rs. ${sale.price.toLocaleString()}</td>
                <td>Rs. ${sale.total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <div class="total">
            Total Amount: Rs. ${sale.total.toLocaleString()}
          </div>
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>MUSA TRADERS - Modern Inventory Solutions</p>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    clientId: 'none',
    quantity: 0,
    price: 0
  });

  const [logToDelete, setLogToDelete] = useState<SaleEntry | null>(null);

  useEffect(() => {
    if (!user) return;
    const qProducts = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const qSales = query(collection(db, 'sales'), orderBy('date', 'desc'), limit(50));
    const unsubscribeLogs = onSnapshot(qSales, (snapshot) => {
      setSalesLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleEntry)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const qClients = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeLogs();
      unsubscribeClients();
    };
  }, [user]);

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    try {
      const batch = writeBatch(db);
      const productRef = doc(db, 'products', logToDelete.productId);
      const product = products.find(p => p.id === logToDelete.productId);
      
      if (product) {
        // Revert the stock change (add back the sold quantity)
        batch.update(productRef, { currentStock: (product.currentStock || 0) + logToDelete.quantity });
      }

      // If sale had a client, revert their totals
      if (logToDelete.clientId) {
        const clientRef = doc(db, 'clients', logToDelete.clientId);
        const client = clients.find(c => c.id === logToDelete.clientId);
        if (client) {
          batch.update(clientRef, {
            totalSpent: Math.max(0, (client.totalSpent || 0) - logToDelete.total),
            totalQuantity: Math.max(0, (client.totalQuantity || 0) - logToDelete.quantity)
          });
        }
      }
      
      batch.delete(doc(db, 'sales', logToDelete.id));
      await batch.commit();

      toast.success('Sale log deleted and stock reverted');
      setLogToDelete(null);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to delete sale log');
    }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.productId || formData.quantity <= 0 || formData.price < 0) {
      return toast.error('Please fill in all fields correctly');
    }

    const selectedProduct = products.find(p => p.id === formData.productId);
    if (!selectedProduct) return;

    if (selectedProduct.currentStock < formData.quantity) {
      return toast.error(`Insufficient stock! Only ${selectedProduct.currentStock} ${selectedProduct.unit} available.`);
    }

    try {
      const batch = writeBatch(db);
      const productRef = doc(db, 'products', formData.productId);
      
      const newStock = selectedProduct.currentStock - Number(formData.quantity);
      const total = Number(formData.quantity) * Number(formData.price);
      const now = Timestamp.now();
      
      const selectedClient = clients.find(c => c.id === formData.clientId);

      // 1. Log the sale
      const saleRef = doc(collection(db, 'sales'));
      const saleData: any = {
        productId: formData.productId,
        productName: selectedProduct.name,
        quantity: Number(formData.quantity),
        price: Number(formData.price),
        total: total,
        date: now,
        soldBy: user.uid
      };

      if (selectedClient) {
        saleData.clientId = selectedClient.id;
        saleData.clientName = selectedClient.name;

        // Update Client aggregator fields
        const clientRef = doc(db, 'clients', selectedClient.id);
        batch.update(clientRef, {
          totalSpent: (selectedClient.totalSpent || 0) + total,
          totalQuantity: (selectedClient.totalQuantity || 0) + Number(formData.quantity),
          lastPurchaseDate: now
        });
      }

      batch.set(saleRef, saleData);

      // 2. Update the product stock
      batch.update(productRef, { currentStock: newStock });
      
      await batch.commit();

      toast.success('Sale logged and stock updated');
      setIsAddDialogOpen(false);
      setFormData({ productId: '', clientId: '', quantity: 0, price: 0 });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to log sale');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Module</h2>
          <p className="text-muted-foreground">Record sales transactions and manage inventory outflow.</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger render={<Button className="gap-2 bg-primary text-primary-foreground" />}>
            <Plus className="w-4 h-4" /> New Sale
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Record New Sale</DialogTitle>
              <DialogDescription>Enter the sales details. Stock will be automatically deducted.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSale} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="client">Client (Optional)</Label>
                <Select onValueChange={(value: string) => setFormData({...formData, clientId: value})} value={formData.clientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client (or Cash Customer)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">--- Cash Customer ---</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product">Product</Label>
                <Select onValueChange={(value: string) => setFormData({...formData, productId: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.currentStock} {p.unit} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input 
                    id="quantity" 
                    type="number" 
                    value={formData.quantity} 
                    onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} 
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Unit Price</Label>
                  <Input 
                    id="price" 
                    type="number" 
                    step="0.01"
                    value={formData.price} 
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})} 
                    required 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-accent/50 border border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Amount</p>
                  <p className="text-xl font-bold mt-1">Rs. {(formData.quantity * formData.price).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/50 border border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Stock After Sale</p>
                  <p className={`text-xl font-bold mt-1 ${
                    (products.find(p => p.id === formData.productId)?.currentStock || 0) - formData.quantity < 0 
                    ? 'text-destructive' 
                    : 'text-primary'
                  }`}>
                    {(products.find(p => p.id === formData.productId)?.currentStock || 0) - formData.quantity}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">Complete Sale</Button>
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
              Recent Sales Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Product</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No sales recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    salesLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {format(log.date.toDate(), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium">{log.productName}</TableCell>
                        <TableCell className="text-xs">{log.clientName || 'Cash'}</TableCell>
                        <TableCell>{log.quantity}</TableCell>
                        <TableCell className="font-bold">Rs. {log.total.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10"
                              onClick={() => handlePrintInvoice(log)}
                              title="Print Invoice"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:bg-destructive/10 h-10 w-10"
                              onClick={() => setLogToDelete(log)}
                              title="Delete Sale"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
                Are you sure you want to delete this sales log? The stock will be reverted.
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
              <DollarSign className="w-5 h-5 text-primary" />
              Sales Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-primary uppercase tracking-wider font-semibold">Revenue Today</p>
              <p className="text-2xl font-bold mt-1 text-primary">
                Rs. {salesLogs
                  .filter(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
                  .reduce((sum, log) => sum + log.total, 0).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Top Selling (Today)</p>
              {Object.entries(
                salesLogs
                  .filter(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
                  .reduce((acc: any, log) => {
                    acc[log.productName] = (acc[log.productName] || 0) + log.total;
                    return acc;
                  }, {})
              ).sort((a: any, b: any) => b[1] - a[1]).map(([name, total]: any) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-semibold">Rs. {total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
