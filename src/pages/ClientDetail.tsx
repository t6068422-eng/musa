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
  Package,
  Trash2,
  Edit2,
  Folder,
  Image as ImageIcon
} from 'lucide-react';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy,
  limit,
  Timestamp,
  writeBatch,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  CheckCircle2, 
  Truck, 
  Clock as ClockIcon, 
  AlertCircle,
  X
} from 'lucide-react';
import { Client, SaleEntry, Product, Builty } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn, safeToDate } from '@/lib/utils';
import { toPng } from 'html-to-image';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user, quotaExceeded } = useAuth();
  const pageRef = React.useRef<HTMLDivElement>(null);
  
  const [client, setClient] = useState<Client | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<SaleEntry[]>([]);
  const [builties, setBuilties] = useState<Builty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleEntry | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<SaleEntry | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);

  const downloadAsImage = () => {
    if (!pageRef.current) return;
    
    toast.loading('Exporting client record as image...');
    toPng(pageRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `ClientDetail_${client?.name || 'Client'}_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Client record captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };
  
  // Form State
  const [manualPurchaseItems, setManualPurchaseItems] = useState([
    {
      productId: '',
      quantity: 1,
      price: 0,
      unitType: 'piece' as 'ctn' | 'piece'
    }
  ]);
  const [manualPurchaseDate, setManualPurchaseDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  const [editSaleData, setEditSaleData] = useState({
    productId: '',
    quantity: 1,
    price: 0,
    date: '',
    unitType: 'piece' as 'ctn' | 'piece'
  });

  useEffect(() => {
    if (!user || !clientId) return;

    // Fetch Products for selection
    const qProducts = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(data.sort((a, b) => a.name.localeCompare(b.name)));
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
      where('clientId', '==', clientId)
    );

    const unsubscribeHistory = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleEntry));
      setPurchaseHistory(data.sort((a, b) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateB - dateA;
      }));
      setLoading(false);
    }, (error) => {
      console.error(error);
      setPurchaseHistory([]); // Error probably means no records or index needed
      setLoading(false);
    });

    // Fetch client builties
    // We filter locally by name since clientId isn't in builty schema yet
    // Limit to 200 recent builties to avoid massive READ hits
    const qBuilties = query(
      collection(db, 'builties'),
      limit(200)
    );

    const unsubscribeBuilties = onSnapshot(qBuilties, (snapshot) => {
      if (!client?.name) return;
      const allBuilties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Builty));
      const sortedBuilties = allBuilties.sort((a, b) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateB - dateA;
      });
      // Filter by receiver name
      setBuilties(sortedBuilties.filter(b => 
        (b.receiverName?.toLowerCase() || '').includes(client.name.toLowerCase()) ||
        (b.senderName?.toLowerCase() || '').includes(client.name.toLowerCase())
      ));
    });

    return () => {
      unsubscribeClient();
      unsubscribeHistory();
      unsubscribeProducts();
      unsubscribeBuilties();
    };
  }, [user, clientId, navigate, client?.name]);

  const addPurchaseItem = () => {
    setManualPurchaseItems([
      ...manualPurchaseItems,
      { productId: '', quantity: 1, price: 0, unitType: 'piece' }
    ]);
  };

  const removePurchaseItem = (index: number) => {
    if (manualPurchaseItems.length <= 1) return;
    setManualPurchaseItems(manualPurchaseItems.filter((_, i) => i !== index));
  };

  const updatePurchaseItem = (index: number, field: string, value: any) => {
    const newItems = [...manualPurchaseItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-fill price if product changes
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].price = product.price || 0;
      }
    }
    
    setManualPurchaseItems(newItems);
  };

  const handleManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !client || !clientId) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    
    // Validation
    const invalidItems = manualPurchaseItems.filter(item => !item.productId || item.quantity <= 0);
    if (invalidItems.length > 0) {
      return toast.error('Please select products and valid quantities for all items');
    }

    // Stock Validation
    for (const item of manualPurchaseItems) {
      const selectedProduct = products.find(p => p.id === item.productId);
      if (!selectedProduct) continue;
      if (selectedProduct.currentStock < item.quantity) {
        return toast.error(`Insufficient stock for ${selectedProduct.name}! Only ${selectedProduct.currentStock} available.`);
      }
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      // Construct local date properly from datetime-local string
      const dateParts = manualPurchaseDate.split('T');
      const [year, month, day] = dateParts[0].split('-').map(Number);
      const [hour, minute] = dateParts[1].split(':').map(Number);
      const selectedDate = new Date(year, month - 1, day, hour, minute);
      
      const saleDate = Timestamp.fromDate(selectedDate);
      let totalSpentInc = 0;
      let totalQtyInc = 0;

      for (const item of manualPurchaseItems) {
        const selectedProduct = products.find(p => p.id === item.productId);
        if (!selectedProduct) continue;

        const total = item.quantity * item.price;
        totalSpentInc += total;
        totalQtyInc += Number(item.quantity);
        
        // 1. Create Sale Record
        const saleRef = doc(collection(db, 'sales'));
        batch.set(saleRef, {
          productId: item.productId,
          productName: selectedProduct.name,
          quantity: Number(item.quantity),
          price: Number(item.price),
          unitType: item.unitType,
          total: total,
          date: saleDate,
          soldBy: user.uid,
          clientId: client.id,
          clientName: client.name
        });

        // 2. Update Product Stock
        const productRef = doc(db, 'products', item.productId);
        batch.update(productRef, {
          currentStock: selectedProduct.currentStock - Number(item.quantity)
        });
      }

      // 3. Update Client Stats
      const clientRef = doc(db, 'clients', client.id);
      const currentLastPurchase = client.lastPurchaseDate?.toMillis() || 0;
      const newPurchaseTime = saleDate.toMillis();
      
      const updateData: any = {
        totalSpent: (client.totalSpent || 0) + totalSpentInc,
        totalQuantity: (client.totalQuantity || 0) + totalQtyInc
      };

      if (newPurchaseTime > currentLastPurchase) {
        updateData.lastPurchaseDate = saleDate;
      }

      batch.update(clientRef, updateData);

      await batch.commit();
      
      toast.success(`${manualPurchaseItems.length} items recorded successfully`);
      setIsManualEntryOpen(false);
      setManualPurchaseItems([{ productId: '', quantity: 1, price: 0, unitType: 'piece' }]);
      setManualPurchaseDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSale = (sale: SaleEntry) => {
    setEditingSale(sale);
    setEditSaleData({
      productId: sale.productId,
      quantity: sale.quantity,
      price: sale.price,
      date: format(sale.date.toDate(), "yyyy-MM-dd'T'HH:mm"),
      unitType: sale.unitType || 'piece'
    });
  };

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !client || !editingSale || !clientId) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');

    const newProduct = products.find(p => p.id === editSaleData.productId);
    if (!newProduct) return toast.error('Invalid product selected');

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const newQty = Number(editSaleData.quantity);
      const newPrice = Number(editSaleData.price);
      const newTotal = newQty * newPrice;
      const dateParts = editSaleData.date.split('T');
      const [year, month, day] = dateParts[0].split('-').map(Number);
      const [hour, minute] = dateParts[1].split(':').map(Number);
      const newDate = Timestamp.fromDate(new Date(year, month - 1, day, hour, minute));

      // Save for undo
      setUndoStack(prev => [{
        type: 'edit',
        data: {
          oldSale: { ...editingSale },
          newSale: { ...editingSale, ...editSaleData, total: newTotal, productName: newProduct.name, date: newDate },
          oldClientState: { ...client }
        }
      }, ...prev].slice(0, 10));

      // 1. Update Product Stock (Revert old, Apply new)
      if (editingSale.productId === editSaleData.productId) {
        const diff = newQty - editingSale.quantity;
        const productRef = doc(db, 'products', editingSale.productId);
        batch.update(productRef, {
          currentStock: newProduct.currentStock - diff
        });
      } else {
        const oldProductRef = doc(db, 'products', editingSale.productId);
        const oldProduct = products.find(p => p.id === editingSale.productId);
        if (oldProduct) {
          batch.update(oldProductRef, {
            currentStock: oldProduct.currentStock + editingSale.quantity
          });
        }
        const newProductRef = doc(db, 'products', editSaleData.productId);
        batch.update(newProductRef, {
          currentStock: newProduct.currentStock - newQty
        });
      }

      // 2. Update Sale Record
      const saleRef = doc(db, 'sales', editingSale.id);
      batch.update(saleRef, {
        productId: editSaleData.productId,
        productName: newProduct.name,
        quantity: newQty,
        price: newPrice,
        unitType: editSaleData.unitType,
        total: newTotal,
        date: newDate
      });

      // 3. Update Client Stats
      const clientRef = doc(db, 'clients', client.id);
      const totalSpentDiff = newTotal - editingSale.total;
      const totalQtyDiff = newQty - editingSale.quantity;
      batch.update(clientRef, {
        totalSpent: (client.totalSpent || 0) + totalSpentDiff,
        totalQuantity: (client.totalQuantity || 0) + totalQtyDiff
      });

      await batch.commit();
      toast.success('Purchase history updated');
      setEditingSale(null);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to update purchase history');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!user || !client || !clientId || !saleToDelete) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const product = products.find(p => p.id === saleToDelete.productId);
      
      // Save for Undo
      setUndoStack(prev => [{
        type: 'delete',
        data: { ...saleToDelete },
        oldClientState: { ...client }
      }, ...prev].slice(0, 10));

      if (product) {
        const productRef = doc(db, 'products', saleToDelete.productId);
        batch.update(productRef, {
          currentStock: product.currentStock + saleToDelete.quantity
        });
      }
      const clientRef = doc(db, 'clients', client.id);
      batch.update(clientRef, {
        totalSpent: (client.totalSpent || 0) - saleToDelete.total,
        totalQuantity: (client.totalQuantity || 0) - saleToDelete.quantity
      });
      batch.delete(doc(db, 'sales', saleToDelete.id));
      await batch.commit();
      toast.success('Purchase record deleted');
      setSaleToDelete(null);
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to delete record: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || !clientId) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    const [lastAction, ...remainingStack] = undoStack;
    
    try {
      if (lastAction.type === 'delete') {
        const batch = writeBatch(db);
        const sale = lastAction.data;
        const saleRef = doc(db, 'sales', sale.id);
        
        batch.set(saleRef, sale);
        
        const clientRef = doc(db, 'clients', clientId);
        batch.update(clientRef, lastAction.oldClientState);

        const product = products.find(p => p.id === sale.productId);
        if (product) {
          const productRef = doc(db, 'products', sale.productId);
          batch.update(productRef, { currentStock: Math.max(0, product.currentStock - sale.quantity) });
        }

        await batch.commit();
        toast.success('Action reverted');
      } else if (lastAction.type === 'edit') {
        const batch = writeBatch(db);
        const { oldSale, newSale, oldClientState } = lastAction.data;
        
        batch.update(doc(db, 'sales', oldSale.id), oldSale);
        batch.update(doc(db, 'clients', clientId), oldClientState);
        
        const product = products.find(p => p.id === oldSale.productId);
        if (product) {
          const productRef = doc(db, 'products', oldSale.productId);
          const stockDiff = newSale.quantity - oldSale.quantity;
          batch.update(productRef, { currentStock: product.currentStock + stockDiff });
        }

        await batch.commit();
        toast.success('Reverted purchase changes');
      }
      setUndoStack(remainingStack);
    } catch (error) {
      console.error(error);
      toast.error('Failed to undo');
    }
  };

  const filteredHistory = purchaseHistory.filter(h => {
    const matchesSearch = h.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         h.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (dateRange.start || dateRange.end) {
      const saleDate = h.date.toDate();
      if (dateRange.start) {
        const [y, m, d] = dateRange.start.split('-').map(Number);
        const startDate = new Date(y, m - 1, d, 0, 0, 0, 0); // Local Midnight
        if (saleDate < startDate) matchesDate = false;
      }
      if (dateRange.end) {
        const [y, m, d] = dateRange.end.split('-').map(Number);
        const endDate = new Date(y, m - 1, d, 23, 59, 59, 999); // Local End of Day
        if (saleDate > endDate) matchesDate = false;
      }
    }
    
    return matchesSearch && matchesDate;
  });

  const groupedPurchases = filteredHistory.reduce((acc: Record<string, SaleEntry[]>, sale) => {
    const saleDate = safeToDate(sale.date);
    const dateKey = format(saleDate, 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(sale);
    return acc;
  }, {});

  const sortedGroupKeys = Object.keys(groupedPurchases).sort((a, b) => b.localeCompare(a));

  const toggleDate = (dateKey: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const grandTotalQty = filteredHistory.reduce((sum, h) => sum + (h.quantity || 0), 0);
  const grandTotalAmount = filteredHistory.reduce((sum, h) => sum + (h.total || 0), 0);

  const exportReport = () => {
    if (!client) return;
    
    // Use filteredHistory instead of full purchaseHistory
    const targetData = filteredHistory;
    
    if (targetData.length === 0) {
      return toast.error('No records found for the selected criteria');
    }

    const headers = ['Date', 'Invoice ID', 'Product', 'Quantity', 'Price', 'Total'];
    const rows = targetData.map(h => [
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
    const dateStr = dateRange.start || dateRange.end 
      ? `_${dateRange.start || 'any'}_to_${dateRange.end || 'today'}`
      : `_${format(new Date(), 'yyyy-MM-dd')}`;
    a.download = `ActivityLog_${client.name.replace(/\s+/g, '_')}${dateStr}.csv`;
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
        <div className="ml-auto flex items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
          >
            <History className="w-4 h-4" /> Undo ({undoStack.length})
          </Button>
          <Button onClick={downloadAsImage} variant="outline" className="gap-2">
            <ImageIcon className="w-4 h-4" /> Download Picture
          </Button>
          <Button onClick={exportReport} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="purchases" className="w-full space-y-6">
      <div ref={pageRef} className="space-y-6">
        <div className="border-b border-border/50">
          <TabsList className="flex h-auto p-0 bg-transparent gap-8 justify-start">
            <TabsTrigger 
              value="purchases" 
              className="flex items-center gap-2 rounded-none border-b-2 border-transparent px-2 pb-3 pt-1 text-sm font-semibold transition-all data-[state=active]:border-primary data-[state=active]:text-primary hover:text-primary/70 bg-transparent shadow-none"
            >
              <ShoppingCart className="w-4 h-4" /> 
              Purchase History
            </TabsTrigger>
            <TabsTrigger 
              value="builties" 
              className="flex items-center gap-2 rounded-none border-b-2 border-transparent px-2 pb-3 pt-1 text-sm font-semibold transition-all data-[state=active]:border-primary data-[state=active]:text-primary hover:text-primary/70 bg-transparent shadow-none"
            >
              <Truck className="w-4 h-4" /> 
              Consignments
            </TabsTrigger>
          </TabsList>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-6 bg-accent/30 border-b border-border/50">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Main Identity & Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 items-center">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Phone Number</p>
                  <p className="text-base font-bold text-foreground">{client.phone}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Email Address</p>
                  <p className="text-base font-bold text-foreground">{client.email || 'None provided'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 lg:col-span-2">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Physical Address / Location</p>
                  <p className="text-base font-bold text-foreground truncate">{client.address || 'No address on file'}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border/40 flex justify-between items-center text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              <span>Client Since: {format(client.createdAt.toDate(), 'MMM yyyy')}</span>
              <span>Last Purchase: {client.lastPurchaseDate ? format(client.lastPurchaseDate.toDate(), 'PPP') : 'No history'}</span>
            </div>
          </CardContent>
        </Card>

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

      <div className="space-y-6">
        <TabsContent value="purchases" className="mt-0">
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    Activity Logs
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                       <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">From:</Label>
                       <Input 
                        type="date" 
                        className="h-8 w-28 text-[10px]" 
                        value={dateRange.start}
                        onChange={e => setDateRange({...dateRange, start: e.target.value})}
                       />
                    </div>
                    <div className="flex items-center gap-2">
                       <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">To:</Label>
                       <Input 
                        type="date" 
                        className="h-8 w-28 text-[10px]"
                        value={dateRange.end}
                        onChange={e => setDateRange({...dateRange, end: e.target.value})}
                       />
                    </div>
                    <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
                      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2 border-primary/50 text-primary hover:bg-primary/5 h-8" />}>
                        <Plus className="w-3 h-3" /> Log Manual Purchase
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                             <Package className="w-5 h-5 text-primary" /> Log Manual Purchase
                          </DialogTitle>
                          <DialogDescription>
                            Record transactions for <strong>{client.name}</strong> manually.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleManualSale} className="space-y-6 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Purchase Date & Time</Label>
                            <Input 
                              id="date" 
                              type="datetime-local" 
                              value={manualPurchaseDate} 
                              onChange={e => setManualPurchaseDate(e.target.value)}
                              required
                              className="h-10"
                            />
                          </div>

                          <div className="space-y-4">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                              Order Items
                              <span className="text-[10px] lowercase font-medium text-muted-foreground/60 tracking-normal normal-case">{manualPurchaseItems.length} items added</span>
                            </Label>
                            
                            <div className="space-y-3">
                              {manualPurchaseItems.map((item, index) => (
                                <div key={index} className="p-4 rounded-xl bg-accent/30 border border-border/50 relative group animate-in fade-in slide-in-from-top-2 duration-200">
                                  {manualPurchaseItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removePurchaseItem(index)}
                                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                    <div className="md:col-span-5 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Product</Label>
                                      <Select 
                                        onValueChange={(val) => updatePurchaseItem(index, 'productId', val)} 
                                        value={item.productId}
                                      >
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder="Select product" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {products.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                              {p.name} ({p.currentStock} {p.unit})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Unit</Label>
                                      <Select 
                                        value={item.unitType} 
                                        onValueChange={(val: 'ctn' | 'piece') => updatePurchaseItem(index, 'unitType', val)}
                                      >
                                        <SelectTrigger className="h-9">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="piece">Pcs</SelectItem>
                                          <SelectItem value="ctn">Ctn</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Qty</Label>
                                      <Input 
                                        type="number" 
                                        value={item.quantity} 
                                        onChange={e => updatePurchaseItem(index, 'quantity', Number(e.target.value))}
                                        min="1"
                                        required
                                        className="h-9"
                                      />
                                    </div>

                                    <div className="md:col-span-3 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-muted-foreground">Price (Rs.)</Label>
                                      <Input 
                                        type="number" 
                                        step="0.01"
                                        value={item.price} 
                                        onChange={e => updatePurchaseItem(index, 'price', Number(e.target.value))}
                                        min="0"
                                        required
                                        className="h-9"
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-3 pt-3 border-t border-border/20 flex justify-between items-center bg-muted/20 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                                      {item.productId ? products.find(p => p.id === item.productId)?.name : 'No product selected'}
                                      <span className="opacity-20">|</span>
                                      {item.quantity} × {item.price.toLocaleString()}
                                    </span>
                                    <span className="text-sm font-black text-primary">Rs. {(item.quantity * item.price).toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={addPurchaseItem}
                              className="w-full h-12 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center gap-2 group transition-all"
                            >
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                <Plus className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <span className="text-xs font-bold uppercase tracking-widest text-primary">Add More Items</span>
                            </Button>
                          </div>

                          <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 flex flex-col items-center justify-center gap-1 shadow-inner">
                            <p className="text-[10px] text-primary/60 uppercase font-black tracking-[0.2em]">Grand Total Calculation</p>
                            <p className="text-3xl font-black text-primary">
                              Rs. {manualPurchaseItems.reduce((sum, item) => sum + (item.quantity * item.price), 0).toLocaleString()}
                            </p>
                          </div>

                          <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="ghost" onClick={() => setIsManualEntryOpen(false)} className="font-bold">Cancel</Button>
                            <Button type="submit" disabled={submitting} className="font-bold min-w-[140px] shadow-lg shadow-primary/20">
                              {submitting ? 'Recording...' : 'Save All Changes'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <div className="relative w-40">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search history..."
                        className="pl-9 h-8 text-[10px]"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-hidden border-x border-b">
                    <div className="overflow-x-auto scrollbar-custom">
                      <div className="max-h-[400px] overflow-y-auto scrollbar-custom pr-1">
                        <Table className="min-w-[800px]">
                          <TableHeader className="sticky top-0 bg-background z-30 shadow-md">
                            <TableRow className="hover:bg-transparent border-b-2">
                              <TableHead className="bg-background font-bold text-foreground py-4 px-6">Date</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Product Name</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Unit</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Qty</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Unit Price</TableHead>
                              <TableHead className="text-right bg-background font-bold text-foreground py-4 pr-6">Total Price</TableHead>
                              <TableHead className="text-right bg-background font-bold text-foreground py-4 pr-6">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredHistory.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">
                                  {loading ? 'Loading records...' : 'No purchase records found.'}
                                </TableCell>
                              </TableRow>
                            ) : (
                              sortedGroupKeys.map((dateKey) => {
                                const groupSales = groupedPurchases[dateKey];
                                const dateObj = new Date(dateKey);
                                const isExpanded = expandedDates[dateKey] ?? (dateKey === sortedGroupKeys[0]);
                                
                                return (
                                  <React.Fragment key={dateKey}>
                                    {/* Month/Day Header Row (Folder Style) */}
                                    <TableRow 
                                      className="bg-muted/40 hover:bg-muted/50 border-y-2 border-primary/10 cursor-pointer transition-colors"
                                      onClick={() => toggleDate(dateKey)}
                                    >
                                      <TableCell colSpan={7} className="py-2.5 px-6">
                                        <div className="flex items-center gap-2">
                                          <div className={cn(
                                            "transition-transform duration-200",
                                            isExpanded ? "rotate-90" : "rotate-0"
                                          )}>
                                            <Folder className="w-3.5 h-3.5 text-primary" />
                                          </div>
                                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                                            {format(dateObj, 'MMMM dd, yyyy')}
                                          </span>
                                          <Badge variant="outline" className="ml-2 text-[8px] font-bold py-0 h-4 border-primary/20 text-primary bg-primary/5">
                                            {groupSales.length} {groupSales.length === 1 ? 'Record' : 'Records'}
                                          </Badge>
                                          <div className="h-px flex-1 bg-primary/10 ml-2" />
                                          <span className="text-[9px] font-bold text-muted-foreground">
                                            {isExpanded ? 'Click to hide' : 'Click to view'}
                                          </span>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    
                                    {isExpanded && groupSales.map((history) => (
                                      <TableRow key={history.id} className="group hover:bg-primary/5 transition-colors">
                                        <TableCell className="text-xs whitespace-nowrap px-6 text-muted-foreground">
                                          {format(safeToDate(history.date), 'HH:mm')}
                                        </TableCell>
                                        <TableCell className="font-medium whitespace-nowrap">
                                          {history.productName}
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                            {history.unitType || 'piece'}
                                          </span>
                                        </TableCell>
                                        <TableCell className="font-bold text-primary">{history.quantity}</TableCell>
                                        <TableCell>Rs. {history.price.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-black pr-6 text-primary">
                                          Rs. {history.total.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button 
                                              variant="ghost" 
                                              size="icon" 
                                              className="h-8 w-8 text-primary hover:bg-primary/10"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleEditSale(history);
                                              }}
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button 
                                              variant="ghost" 
                                              size="icon" 
                                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSaleToDelete(history);
                                              }}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    
                                    {isExpanded && (
                                      <TableRow className="bg-primary/5 border-t border-primary/10 font-bold">
                                        <TableCell colSpan={3} className="text-right py-2 uppercase text-[9px] tracking-widest text-muted-foreground px-6 py-3">
                                          Daily Sub-total
                                        </TableCell>
                                        <TableCell className="text-primary">{groupSales.reduce((sum, s) => sum + s.quantity, 0)}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right text-primary pr-6">
                                          Rs. {groupSales.reduce((sum, s) => sum + s.total, 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell></TableCell>
                                      </TableRow>
                                    )}
                                  </React.Fragment>
                                );
                              })
                            )}

                            {filteredHistory.length > 0 && (
                              <TableRow className="bg-primary/10 font-bold border-t-2 border-green-800 h-14">
                                <TableCell colSpan={3} className="text-right px-6 border-r border-green-800/30">
                                  <span className="text-[10px] uppercase tracking-widest text-primary font-black">Grand Total</span>
                                </TableCell>
                                <TableCell className="border-r border-green-800/30 text-primary text-base">
                                  {grandTotalQty.toLocaleString()}
                                </TableCell>
                                <TableCell className="border-r border-green-800/30"></TableCell>
                                <TableCell className="text-right border-r border-green-800/30 text-primary text-base pr-6">
                                  Rs. {grandTotalAmount.toLocaleString()}
                                </TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="builties" className="mt-4">
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Truck className="w-5 h-5 text-primary" />
                    Related Consignments
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-hidden border-x border-b">
                    <div className="overflow-x-auto scrollbar-custom">
                      <div className="max-h-[400px] overflow-y-auto scrollbar-custom pr-1">
                        <Table className="min-w-[800px]">
                          <TableHeader className="sticky top-0 bg-background z-30 shadow-md">
                            <TableRow className="hover:bg-transparent border-b-2">
                              <TableHead className="bg-background font-bold text-foreground py-4 px-6">Builty #</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Date</TableHead>
                              <TableHead className="bg-background font-bold text-foreground py-4">Destination</TableHead>
                              <TableHead className="text-center bg-background font-bold text-foreground py-4">Status</TableHead>
                              <TableHead className="text-right bg-background font-bold text-foreground py-4 pr-6">Freight</TableHead>
                            </TableRow>
                          </TableHeader>
                        <TableBody>
                        {builties.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                              No builties found for this client.
                            </TableCell>
                          </TableRow>
                        ) : (
                          builties.map((builty) => (
                            <TableRow 
                              key={builty.id} 
                              className="cursor-pointer hover:bg-accent/50" 
                              onClick={() => navigate(`/builties/${builty.id}`)}
                            >
                              <TableCell className="font-bold text-primary px-6">
                                {builty.builtyNumber}
                              </TableCell>
                              <TableCell className="text-xs">
                                {format(builty.date.toDate(), 'dd MMM yyyy')}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 opacity-50" /> {builty.destination}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {(() => {
                                  switch (builty.status) {
                                    case 'pending': return <Badge variant="outline" className="gap-1"><ClockIcon className="w-3 h-3" /> Pending</Badge>;
                                    case 'in-transit': return <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700"><Truck className="w-3 h-3" /> In Transit</Badge>;
                                    case 'delivered': return <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Delivered</Badge>;
                                    case 'cancelled': return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Cancelled</Badge>;
                                  }
                                })()}
                              </TableCell>
                              <TableCell className="text-right font-medium pr-6">
                                Rs. {builty.freightAmount?.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </CardContent>
            </Card>
          </TabsContent>
        </div>
      </div>

        {/* Edit History Dialog */}
        <Dialog open={!!editingSale} onOpenChange={(open) => !open && setEditingSale(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Purchase Record</DialogTitle>
              <DialogDescription>
                Modify the selected purchase record for <strong>{client.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateSale} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-product">Product</Label>
                <Select 
                  onValueChange={(val) => setEditSaleData({...editSaleData, productId: val})} 
                  value={editSaleData.productId}
                >
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
              <div className="grid gap-2">
                <Label htmlFor="edit-date">Transaction Date</Label>
                <Input 
                  id="edit-date" 
                  type="datetime-local" 
                  value={editSaleData.date} 
                  onChange={e => setEditSaleData({ ...editSaleData, date: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-unitType">Unit</Label>
                  <Select 
                    value={editSaleData.unitType} 
                    onValueChange={(val: 'ctn' | 'piece') => setEditSaleData({ ...editSaleData, unitType: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="piece">Piece</SelectItem>
                      <SelectItem value="ctn">Carton (Ctn)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-quantity">Qty</Label>
                  <Input 
                    id="edit-quantity" 
                    type="number" 
                    value={editSaleData.quantity} 
                    onChange={e => setEditSaleData({ ...editSaleData, quantity: Number(e.target.value) })}
                    min="0"
                    required
                  />
                </div>
                <div className="grid gap-2 lg:col-span-1 col-span-2">
                  <Label htmlFor="edit-price">Price (Rs.)</Label>
                  <Input 
                    id="edit-price" 
                    type="number" 
                    step="0.01"
                    value={editSaleData.price} 
                    onChange={e => setEditSaleData({ ...editSaleData, price: Number(e.target.value) })}
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-accent/50 border border-border/50 text-center">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">New Total</p>
                <p className="text-2xl font-bold text-primary">Rs. {(editSaleData.quantity * editSaleData.price).toLocaleString()}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingSale(null)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Updating...' : 'Update Record'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!saleToDelete} onOpenChange={(open) => !open && setSaleToDelete(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this purchase record? 
                This will automatically revert <strong>{saleToDelete?.quantity} {products.find(p => p.id === saleToDelete?.productId)?.unit}</strong> back to stock.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 text-sm">
              <p>Product: <span className="font-semibold">{saleToDelete?.productName}</span></p>
              <p>Total Amount: <span className="font-semibold text-destructive">Rs. {saleToDelete?.total.toLocaleString()}</span></p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaleToDelete(null)}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSale}
                disabled={submitting}
              >
                {submitting ? 'Deleting...' : 'Delete Record'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}
