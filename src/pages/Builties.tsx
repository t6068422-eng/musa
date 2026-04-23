import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Truck, 
  User, 
  MapPin,
  MoreVertical,
  Edit2,
  Trash2,
  FileText,
  DollarSign,
  Undo2,
  Download,
  Calendar,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  CheckSquare,
  Square,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Builty, Client } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';

export default function Builties() {
  const [builties, setBuilties] = useState<Builty[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Builty['status'] | 'all'>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBuilty, setEditingBuilty] = useState<Builty | null>(null);
  const [builtyToDelete, setBuiltyToDelete] = useState<Builty | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Builty; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });
  const [undoStack, setUndoStack] = useState<{ type: string; data: any }[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedBuilties, setSelectedBuilties] = useState<Set<string>>(new Set());
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<Builty['status']>('pending');
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<any[]>([]); // Added products state
  const { user, isAdmin, quotaExceeded, setQuotaExceeded } = useAuth();
  const navigate = useNavigate();
  const tableRef = React.useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    builtyNumber: '',
    senderName: '',
    receiverName: '',
    destination: '',
    transportName: '',
    totalItems: 0,
    weight: '',
    unitPrice: 0,
    freightAmount: 0,
    status: 'pending' as Builty['status'],
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    items: [] as any[] // Added items to formData
  });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'), orderBy('name', 'asc')); // Fetch products
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn('Failed to fetch products:', error);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'builties'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBuilties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Builty)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'builties');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => {
      console.warn('Failed to fetch clients for dropdown:', error);
    });

    return () => unsubscribe();
  }, [user]);

  const pushToUndo = (action: { type: string; data: any }) => {
    setUndoStack(prev => [action, ...prev].slice(0, 10));
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    const lastAction = undoStack[0];
    const remainingStack = undoStack.slice(1);

    try {
      if (lastAction.type === 'delete') {
        const { id, ...rest } = lastAction.data;
        await setDoc(doc(db, 'builties', id), rest);
        toast.success(`Restored builty: ${lastAction.data.builtyNumber}`);
      } else if (lastAction.type === 'bulk-delete') {
        const items = lastAction.data as any[];
        const batch = writeBatch(db);
        items.forEach(item => {
          const { id, ...rest } = item;
          batch.set(doc(db, 'builties', id), rest);
        });
        await batch.commit();
        toast.success(`Restored ${items.length} builties`);
      } else if (lastAction.type === 'edit') {
        const { id, prevState } = lastAction.data;
        await updateDoc(doc(db, 'builties', id), prevState);
        toast.success(`Reverted changes for ${prevState.builtyNumber}`);
      } else if (lastAction.type === 'add') {
        await deleteDoc(doc(db, 'builties', lastAction.data.id));
        toast.success(`Removed added builty: ${lastAction.data.builtyNumber}`);
      }
      setUndoStack(remainingStack);
    } catch (error) {
      console.error(error);
      toast.error('Failed to undo last action');
    }
  };

  const handleAddBuilty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    if (!formData.builtyNumber || !formData.senderName || !formData.receiverName) {
      return toast.error('Required fields are missing');
    }

    setIsSubmitting(true);
    try {
      const dateParts = formData.date.split('-');
      const dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      
      if (isNaN(dateObj.getTime())) {
        setIsSubmitting(false);
        return toast.error('Invalid date selected');
      }

      const builtyData = {
        ...formData,
        totalItems: Number(formData.totalItems),
        unitPrice: Number(formData.unitPrice),
        freightAmount: Number(formData.freightAmount),
        date: Timestamp.fromDate(dateObj),
        createdAt: Timestamp.now()
      };

      if (editingBuilty) {
        const builtyRef = doc(db, 'builties', editingBuilty.id);
        const prevState = { ...editingBuilty };
        delete (prevState as any).id;
        
        await updateDoc(builtyRef, {
          ...formData,
          totalItems: Number(formData.totalItems),
          unitPrice: Number(formData.unitPrice),
          freightAmount: Number(formData.freightAmount),
          date: Timestamp.fromDate(dateObj),
          items: formData.items || []
        });
        
        pushToUndo({ type: 'edit', data: { id: editingBuilty.id, prevState } });
        toast.success('Builty updated successfully');
      } else {
        await addDoc(collection(db, 'builties'), builtyData);
        toast.success('Builty added successfully');
      }
      setIsAddDialogOpen(false);
      setEditingBuilty(null);
      setFormData({
        builtyNumber: '',
        senderName: '',
        receiverName: '',
        destination: '',
        transportName: '',
        totalItems: 0,
        weight: '',
        unitPrice: 0,
        freightAmount: 0,
        status: 'pending',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
        items: []
      });
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'resource-exhausted') {
        setQuotaExceeded(true);
        toast.error('Quota Exceeded: Daily cloud writes limit reached.');
      } else {
        toast.error('Failed to save builty. Check connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBuilty = async () => {
    if (!builtyToDelete) return;
    console.log('Attempting to delete builty:', builtyToDelete.id);
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'builties', builtyToDelete.id));
      pushToUndo({ type: 'delete', data: builtyToDelete });
      toast.success('Builty deleted successfully');
      setBuiltyToDelete(null);
      
      // Remove from selection if deleted
      setSelectedBuilties(prev => {
        const next = new Set(prev);
        next.delete(builtyToDelete.id);
        return next;
      });
    } catch (error: any) {
      if (error?.code === 'resource-exhausted') {
        setQuotaExceeded(true);
        toast.error('Quota Exceeded: Cannot delete from cloud.');
      } else {
        toast.error('Failed to delete builty: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBuilties.size === 0) return;
    console.log('Bulk delete check - isAdmin:', isAdmin, 'Quota:', quotaExceeded);
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    
    setIsBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    console.log('Confirming bulk delete for IDs:', Array.from(selectedBuilties));
    setIsDeleting(true);
    setIsBulkDeleteDialogOpen(false);
    const toastId = toast.loading(`Deleting ${selectedBuilties.size} builties...`);
    
    try {
      const batch = writeBatch(db);
      const deletedItems: any[] = [];
      const idsToDelete = Array.from(selectedBuilties);
      
      for (const id of idsToDelete) {
        const builty = builties.find(b => b.id === id);
        if (builty) {
          batch.delete(doc(db, 'builties', id));
          deletedItems.push(builty);
        } else {
          console.warn(`Builty with ID ${id} not found in current list, skipping.`);
        }
      }

      if (deletedItems.length === 0) {
        toast.dismiss(toastId);
        setIsDeleting(false);
        return toast.error('No matching records found to delete');
      }
      
      console.log(`Committing batch delete for ${deletedItems.length} items...`);
      await batch.commit();
      
      pushToUndo({ type: 'bulk-delete', data: deletedItems });
      toast.success(`Successfully deleted ${deletedItems.length} records`, { id: toastId });
      setSelectedBuilties(new Set());
    } catch (error: any) {
      console.error('Bulk deletion failed:', error);
      toast.error('Failed to perform bulk deletion: ' + (error.message || 'Unknown error'), { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedBuilties.size === 0) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');

    setIsBulkStatusOpen(false);
    setIsSubmitting(true);
    const toastId = toast.loading(`Updating status for ${selectedBuilties.size} builties...`);

    try {
      const batch = writeBatch(db);
      selectedBuilties.forEach(id => {
        batch.update(doc(db, 'builties', id), { status: bulkStatus });
      });

      await batch.commit();
      toast.success(`Updated ${selectedBuilties.size} builties to ${bulkStatus}`, { id: toastId });
      setSelectedBuilties(new Set());
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to update statuses', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelectAll = () => {
    console.log('Toggle Select All. Filtered Count:', filteredBuilties.length, 'Selected Count:', selectedBuilties.size);
    if (selectedBuilties.size === filteredBuilties.length && filteredBuilties.length > 0) {
      setSelectedBuilties(new Set());
    } else {
      const allIds = filteredBuilties.map(b => b.id);
      setSelectedBuilties(new Set(allIds));
    }
  };

  const toggleSelectBuilty = (id: string) => {
    setSelectedBuilties(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const requestSort = (key: keyof Builty) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredBuilties = builties
    .filter(b => {
      const matchesSearch = 
        b.builtyNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.receiverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.destination.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      
      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const builtyDate = b.date.toDate();
        if (dateRange.start) {
          const startDate = new Date(dateRange.start);
          startDate.setHours(0, 0, 0, 0);
          if (builtyDate < startDate) matchesDate = false;
        }
        if (dateRange.end) {
          const endDate = new Date(dateRange.end);
          endDate.setHours(23, 59, 59, 999);
          if (builtyDate > endDate) matchesDate = false;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      let aVal: any = a[key];
      let bVal: any = b[key];

      if (key === 'date' || key === 'createdAt') {
        aVal = aVal?.toMillis() || 0;
        bVal = bVal?.toMillis() || 0;
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });

  const downloadAsImage = () => {
    if (!tableRef.current) return;
    toast.loading('Preparing image download...');
    toPng(tableRef.current, { backgroundColor: '#ffffff', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `BuiltyDirectory_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Image downloaded successfully');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to download image');
      });
  };

  const getStatusBadge = (status: Builty['status']) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case 'in-transit': return <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 hover:bg-blue-200"><Truck className="w-3 h-3" /> In Transit</Badge>;
      case 'delivered': return <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><CheckCircle2 className="w-3 h-3" /> Delivered</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Cancelled</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Builty Management</h2>
          <p className="text-muted-foreground">Track consignments, shipping documents, and freight status.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {undoStack.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleUndo} className="gap-2">
              <Undo2 className="w-4 h-4" /> Undo ({undoStack.length})
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={downloadAsImage} className="gap-2">
            <Download className="w-4 h-4" /> Download Picture
          </Button>

          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setEditingBuilty(null);
              setFormData({
                builtyNumber: '', senderName: '', receiverName: '', destination: '',
                transportName: '', totalItems: 0, weight: '', unitPrice: 0, freightAmount: 0,
                status: 'pending', date: format(new Date(), 'yyyy-MM-dd'), notes: '',
                items: []
              });
            }
          }}>
            <DialogTrigger render={<Button className="gap-2" />}>
              <Plus className="w-4 h-4" /> New Builty
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{editingBuilty ? 'Edit Builty' : 'Add New Builty'}</DialogTitle>
                <DialogDescription>Record a new consignment note details.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddBuilty}>
                <div className="max-h-[60vh] overflow-y-auto pr-4 py-4 -mr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="clientSelect">Select Client (Auto-fill)</Label>
                      <Select onValueChange={(clientId) => {
                        const client = clients.find(c => c.id === clientId);
                        if (client) {
                          setFormData({
                            ...formData,
                            receiverName: client.name,
                            destination: client.address || formData.destination
                          });
                        }
                      }}>
                        <SelectTrigger id="clientSelect">
                          <SelectValue placeholder="Existing Client Database" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                <div className="grid gap-2">
                  <Label htmlFor="builtyNumber">Builty Number *</Label>
                  <Input 
                    id="builtyNumber" 
                    value={formData.builtyNumber} 
                    onChange={e => setFormData({...formData, builtyNumber: e.target.value})} 
                    placeholder="BUIL-12345"
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input 
                    id="date" 
                    type="date"
                    value={formData.date} 
                    onChange={e => setFormData({...formData, date: e.target.value})} 
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="senderName">Sender Name *</Label>
                  <Input 
                    id="senderName" 
                    value={formData.senderName} 
                    onChange={e => setFormData({...formData, senderName: e.target.value})} 
                    placeholder="Musa Traders"
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="receiverName">Receiver Name *</Label>
                  <Input 
                    id="receiverName" 
                    value={formData.receiverName} 
                    onChange={e => setFormData({...formData, receiverName: e.target.value})} 
                    placeholder="Client Name"
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="destination">Destination *</Label>
                  <Input 
                    id="destination" 
                    value={formData.destination} 
                    onChange={e => setFormData({...formData, destination: e.target.value})} 
                    placeholder="City, Country"
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="transportName">Transport / Vehicle</Label>
                  <Input 
                    id="transportName" 
                    value={formData.transportName} 
                    onChange={e => setFormData({...formData, transportName: e.target.value})} 
                    placeholder="Faisal Movers / LPT-123"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="totalItems">Total Items</Label>
                  <Input 
                    id="totalItems" 
                    type="number"
                    value={formData.totalItems} 
                    onChange={e => setFormData({...formData, totalItems: Number(e.target.value)})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unitPrice">Unit Price (Rs.)</Label>
                  <Input 
                    id="unitPrice" 
                    type="number"
                    value={formData.unitPrice} 
                    onChange={e => setFormData({...formData, unitPrice: Number(e.target.value)})} 
                    placeholder="Rate per item"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="weight">Total Weight (Optional)</Label>
                  <Input 
                    id="weight" 
                    value={formData.weight} 
                    onChange={e => setFormData({...formData, weight: e.target.value})} 
                    placeholder="e.g. 500kg"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="freight">Freight Amount (Rs.)</Label>
                  <Input 
                    id="freight" 
                    type="number"
                    value={formData.freightAmount} 
                    onChange={e => setFormData({...formData, freightAmount: Number(e.target.value)})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Current Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(val: any) => setFormData({...formData, status: val})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="notes">Notes / Observations</Label>
                      <Input 
                        id="notes" 
                        value={formData.notes} 
                        onChange={e => setFormData({...formData, notes: e.target.value})} 
                        placeholder="Extra details about consignment"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Consignment Items</h4>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setFormData({
                            ...formData, 
                            items: [...formData.items, { productId: '', productName: '', quantity: 1, price: 0 }]
                          })}
                          className="h-8 gap-2"
                        >
                          <Plus className="w-3 h-3" /> Add Item
                        </Button>
                      </div>
                      
                      {formData.items.length === 0 ? (
                        <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground text-xs italic">
                          No items added. Click 'Add Item' to list products.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {formData.items.map((item, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-accent/30 border border-border/50">
                              <div className="col-span-5 space-y-1">
                                <Label className="text-[10px] uppercase text-muted-foreground">Product</Label>
                                <Select 
                                  value={item.productId} 
                                  onValueChange={(val) => {
                                    const prod = products.find(p => p.id === val);
                                    const nextItems = [...formData.items];
                                    nextItems[index] = { 
                                      ...nextItems[index], 
                                      productId: val, 
                                      productName: prod?.name || '',
                                      price: prod?.price || 0
                                    };
                                    setFormData({ ...formData, items: nextItems });
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map(p => (
                                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-3 space-y-1">
                                <Label className="text-[10px] uppercase text-muted-foreground">Qty</Label>
                                <Input 
                                  type="number" 
                                  className="h-8 text-xs font-bold" 
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const nextItems = [...formData.items];
                                    nextItems[index].quantity = Number(e.target.value);
                                    // Update total items automatically
                                    const total = nextItems.reduce((sum, i) => sum + i.quantity, 0);
                                    setFormData({ ...formData, items: nextItems, totalItems: total });
                                  }}
                                />
                              </div>
                              <div className="col-span-3 space-y-1">
                                <Label className="text-[10px] uppercase text-muted-foreground">Price</Label>
                                <Input 
                                  type="number" 
                                  className="h-8 text-xs" 
                                  value={item.price}
                                  onChange={(e) => {
                                    const nextItems = [...formData.items];
                                    nextItems[index].price = Number(e.target.value);
                                    setFormData({ ...formData, items: nextItems });
                                  }}
                                />
                              </div>
                              <div className="col-span-1 pb-1">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    const nextItems = formData.items.filter((_, i) => i !== index);
                                    const total = nextItems.reduce((sum, i) => sum + i.quantity, 0);
                                    setFormData({ ...formData, items: nextItems, totalItems: total });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          
                          <div className="flex justify-end pt-2">
                             <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-accent/50 px-3 py-1 rounded-full border border-border/50">
                               Total Sum: {formData.items.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0).toLocaleString()} Rs.
                             </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </div>
                    ) : (
                      editingBuilty ? 'Update Builty' : 'Save Builty'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Builties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{builties.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">In Transit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {builties.filter(b => b.status === 'in-transit').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">
              {builties.filter(b => b.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">
              {builties.filter(b => b.status === 'delivered').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Builty Directory
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search number, sender..."
                  className="pl-9 h-9"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="w-full md:w-[150px] h-9">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="flex items-center gap-2">
               <Label className="text-xs uppercase text-muted-foreground whitespace-nowrap">From:</Label>
               <Input 
                type="date" 
                className="h-8 text-xs" 
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
               />
            </div>
            <div className="flex items-center gap-2">
               <Label className="text-xs uppercase text-muted-foreground whitespace-nowrap">To:</Label>
               <Input 
                type="date" 
                className="h-8 text-xs"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
               />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0" ref={tableRef}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[50px] text-center">
                    <Checkbox 
                      checked={filteredBuilties.length > 0 && selectedBuilties.size === filteredBuilties.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[150px] cursor-pointer hover:text-primary transition-colors h-12" onClick={() => requestSort('builtyNumber')}>
                    <div className="flex items-center gap-1 uppercase text-[10px] font-black tracking-widest">
                       Builty # {sortConfig?.key === 'builtyNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('date')}>
                    <div className="flex items-center gap-1 uppercase text-[10px] font-black tracking-widest">
                       Date {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('senderName')}>
                    <div className="flex items-center gap-1 uppercase text-[10px] font-black tracking-widest">
                       Sender {sortConfig?.key === 'senderName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('receiverName')}>
                    <div className="flex items-center gap-1 uppercase text-[10px] font-black tracking-widest">
                       Receiver {sortConfig?.key === 'receiverName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('status')}>
                    <div className="flex items-center justify-center gap-1 uppercase text-[10px] font-black tracking-widest">
                       Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('freightAmount')}>
                    <div className="flex items-center justify-end gap-1 uppercase text-[10px] font-black tracking-widest">
                       Freight {sortConfig?.key === 'freightAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right uppercase text-[10px] font-black tracking-widest">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBuilties.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-24 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Truck className="w-12 h-12 opacity-10" />
                        <p>No builties found matching your current filters.</p>
                        {(searchTerm || statusFilter !== 'all' || dateRange.start || dateRange.end) && (
                          <Button variant="link" onClick={() => {
                            setSearchTerm('');
                            setStatusFilter('all');
                            setDateRange({ start: '', end: '' });
                          }}>Clear all filters</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBuilties.map((builty) => (
                    <TableRow 
                      key={builty.id} 
                      className={cn(
                        "cursor-pointer hover:bg-accent/50 border-b border-border/40",
                        selectedBuilties.has(builty.id) && "bg-primary/5 border-l-2 border-l-primary"
                      )}
                      onClick={() => navigate(`/builties/${builty.id}`)}
                    >
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedBuilties.has(builty.id)}
                          onCheckedChange={() => toggleSelectBuilty(builty.id)}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="font-bold text-primary">{builty.builtyNumber}</div>
                        <div className="text-[10px] text-muted-foreground uppercase font-medium">{builty.transportName || 'N/A'}</div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {format(builty.date.toDate(), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-sm">
                         <div className="font-semibold">{builty.senderName}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                         <div className="font-medium text-muted-foreground">{builty.receiverName}</div>
                         <div className="text-[10px] flex items-center gap-1 opacity-60">
                           <MapPin className="w-2.5 h-2.5" /> {builty.destination}
                         </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(builty.status)}
                      </TableCell>
                      <TableCell className="text-right font-black text-primary">
                        Rs. {builty.freightAmount?.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10" />}>
                            <MoreVertical className="w-4 h-4 text-primary" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => {
                              setEditingBuilty(builty);
                              setFormData({
                                builtyNumber: builty.builtyNumber,
                                senderName: builty.senderName,
                                receiverName: builty.receiverName,
                                destination: builty.destination,
                                transportName: builty.transportName || '',
                                totalItems: builty.totalItems || 0,
                                weight: builty.weight || '',
                                unitPrice: builty.unitPrice || 0,
                                freightAmount: builty.freightAmount || 0,
                                status: builty.status,
                                date: format(builty.date.toDate(), 'yyyy-MM-dd'),
                                notes: builty.notes || '',
                                items: builty.items || []
                              });
                              setIsAddDialogOpen(true);
                            }} className="gap-2 focus:bg-primary focus:text-primary-foreground">
                              <Edit2 className="w-4 h-4" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/builties/${builty.id}`)} className="gap-2">
                              <FileText className="w-4 h-4" /> View Full View
                            </DropdownMenuItem>
                            {isAdmin && (
                              <DropdownMenuItem className="text-destructive gap-2 focus:bg-destructive focus:text-destructive-foreground" onClick={() => setBuiltyToDelete(builty)}>
                                <Trash2 className="w-4 h-4" /> Delete Record
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={!!builtyToDelete} onOpenChange={(open) => !open && setBuiltyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete the builty record for <strong>{builtyToDelete?.builtyNumber}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuiltyToDelete(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBuilty} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions Bar */}
      {selectedBuilties.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white dark:bg-slate-900 border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6">
            <div className="flex items-center gap-2 pr-4 border-r border-border">
              <Badge variant="secondary" className="rounded-full px-2 py-0.5 bg-primary text-primary-foreground">
                {selectedBuilties.size}
              </Badge>
              <span className="text-sm font-medium">Selected</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsBulkStatusOpen(true)}
                className="gap-2 rounded-full"
              >
                <RefreshCw className="w-4 h-4" />
                Change Status
              </Button>
              
              {isAdmin && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="gap-2 rounded-full"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Selected
                </Button>
              )}
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedBuilties(new Set())}
                className="rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Status Update Dialog */}
      <Dialog open={isBulkStatusOpen} onOpenChange={setIsBulkStatusOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update {selectedBuilties.size} Builties</DialogTitle>
            <DialogDescription>
              Select the new status for the selected consignments.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Label htmlFor="bulkStatus">New Status</Label>
            <Select 
              value={bulkStatus} 
              onValueChange={(val: any) => setBulkStatus(val)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkStatusOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkStatusUpdate} disabled={isSubmitting}>
              Update {selectedBuilties.size} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Bulk Delete Confirmation
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete <strong>{selectedBuilties.size}</strong> consignment records. This action can be undone if needed, but will be removed from your active directory immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Records'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
