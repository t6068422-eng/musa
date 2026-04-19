import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Plus,
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  ShoppingCart, 
  DollarSign, 
  Calendar,
  CreditCard,
  History,
  Download,
  Search,
  Package
} from 'lucide-react';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Client, SaleEntry, Product } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [client, setClient] = useState<Client | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<SaleEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 1,
    price: 0
  });

  useEffect(() => {
    if (!user || !clientId) return;

    // Fetch Products for selection
    const qProducts = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });

    // Fetch Client Details
    const unsubscribeClient = onSnapshot(doc(db, 'clients', clientId), (snapshot) => {
      if (snapshot.exists()) {
        setClient({ id: snapshot.id, ...snapshot.data() } as Client);
      } else {
        toast.error('Client not found');
        navigate('/clients');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    // Fetch client purchase history
    const q = query(
      collection(db, 'sales'),
      where('clientId', '==', clientId),
      orderBy('date', 'desc')
    );

    const unsubscribeHistory = onSnapshot(q, (snapshot) => {
      setPurchaseHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleEntry)));
      setLoading(false);
    }, (error) => {
      console.error(error);
      setPurchaseHistory([]); // Error probably means no records or index needed
      setLoading(false);
    });

    return () => {
      unsubscribeClient();
      unsubscribeHistory();
      unsubscribeProducts();
    };
  }, [user, clientId, navigate]);

  const handleProductSelect = (pId: string) => {
    const product = products.find(p => p.id === pId);
    if (product) {
      setFormData({
        ...formData,
        productId: pId,
        price: product.price || 0
      });
    }
  };

  const handleManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !client || !clientId) return;
    if (!formData.productId || formData.quantity <= 0) {
      return toast.error('Please select a product and valid quantity');
    }

    const selectedProduct = products.find(p => p.id === formData.productId);
    if (!selectedProduct) return;

    if (selectedProduct.currentStock < formData.quantity) {
      return toast.error(`Insufficient stock! Only ${selectedProduct.currentStock} ${selectedProduct.unit} available.`);
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const now = Timestamp.now();
      const total = formData.quantity * formData.price;
      
      // 1. Create Sale Record
      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, {
        productId: formData.productId,
        productName: selectedProduct.name,
        quantity: Number(formData.quantity),
        price: Number(formData.price),
        total: total,
        date: now,
        soldBy: user.uid,
        clientId: client.id,
        clientName: client.name
      });

      // 2. Update Product Stock
      const productRef = doc(db, 'products', formData.productId);
      batch.update(productRef, {
        currentStock: selectedProduct.currentStock - Number(formData.quantity)
      });

      // 3. Update Client Stats
      const clientRef = doc(db, 'clients', client.id);
      batch.update(clientRef, {
        totalSpent: (client.totalSpent || 0) + total,
        totalQuantity: (client.totalQuantity || 0) + Number(formData.quantity),
        lastPurchaseDate: now
      });

      await batch.commit();
      
      toast.success('Purchase recorded successfully');
      setIsManualEntryOpen(false);
      setFormData({ productId: '', quantity: 1, price: 0 });
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHistory = purchaseHistory.filter(h => 
    h.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportReport = () => {
    if (!client) return;
    
    // Simple CSV export
    const headers = ['Date', 'Invoice ID', 'Product', 'Quantity', 'Price', 'Total'];
    const rows = filteredHistory.map(h => [
      format(h.date.toDate(), 'yyyy-MM-dd HH:mm'),
      h.id,
      h.productName,
      h.quantity,
      h.price,
      h.total
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PurchaseHistory_${client.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Report exported successfully');
  };

  if (!client && loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{client.name}</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" /> {client.phone}
            <span className="opacity-20">|</span>
            <Calendar className="w-4 h-4" /> Added {format(client.createdAt.toDate(), 'PPP')}
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={exportReport} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{purchaseHistory.length}</div>
              <ShoppingCart className="w-8 h-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">
                {purchaseHistory.reduce((sum, h) => sum + h.quantity, 0).toLocaleString()}
              </div>
              <Package className="w-8 h-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Amount Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-primary">
                Rs. {purchaseHistory.reduce((sum, h) => sum + h.total, 0).toLocaleString()}
              </div>
              <DollarSign className="w-8 h-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Credit Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className={cn(
                "text-2xl font-bold",
                (client.creditBalance || 0) > 0 ? "text-destructive" : "text-emerald-500"
              )}>
                Rs. {(client.creditBalance || 0).toLocaleString()}
              </div>
              <CreditCard className="w-8 h-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-8 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Purchase History
            </CardTitle>
            <div className="flex items-center gap-3">
              <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
                <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2 border-primary/50 text-primary hover:bg-primary/5" />}>
                  <Plus className="w-3 h-3" /> Log Manual Purchase
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Log Manual Purchase</DialogTitle>
                    <DialogDescription>
                      Record a transaction for <strong>{client.name}</strong> manually.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleManualSale} className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="product">Product</Label>
                      <Select onValueChange={handleProductSelect} value={formData.productId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.currentStock} {p.unit} in stock)
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
                          onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                          min="1"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="price">Unit Price (Rs.)</Label>
                        <Input 
                          id="price" 
                          type="number" 
                          step="0.01"
                          value={formData.price} 
                          onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                          min="0"
                          required
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-accent/50 border border-border/50 text-center">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Total Calculation</p>
                      <p className="text-2xl font-bold text-primary">Rs. {(formData.quantity * formData.price).toLocaleString()}</p>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsManualEntryOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Recording...' : 'Save Purchase'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <div className="relative w-48 scale-90 origin-right">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search history..."
                  className="pl-9 h-9"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead className="text-right">Total Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                        {loading ? 'Loading records...' : 'No purchase records found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((history) => (
                      <TableRow key={history.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(history.date.toDate(), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {history.productName}
                        </TableCell>
                        <TableCell>{history.quantity}</TableCell>
                        <TableCell>Rs. {history.price.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">
                          Rs. {history.total.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-4 border-border/50 bg-card/50 backdrop-blur-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Client Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-accent/50 p-2 rounded-md">
                  <Phone className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Phone</p>
                  <p className="text-sm font-semibold">{client.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-accent/50 p-2 rounded-md">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Email</p>
                  <p className="text-sm font-semibold">{client.email || 'Not provided'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-accent/50 p-2 rounded-md">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Address</p>
                  <p className="text-sm font-semibold">{client.address || 'No address saved'}</p>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 italic">
                Last activity: {client.lastPurchaseDate ? format(client.lastPurchaseDate.toDate(), 'PPP') : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
