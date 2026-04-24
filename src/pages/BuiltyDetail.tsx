import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus, 
  Search, 
  Truck, 
  User, 
  MapPin, 
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Package,
  Weight,
  History,
  Download,
  Edit2,
  Printer,
  Image as ImageIcon,
  Trash2,
  Clock as ClockIcon,
  X,
  History as HistoryIcon
} from 'lucide-react';
import { 
  doc, 
  onSnapshot, 
  updateDoc,
  Timestamp,
  deleteDoc,
  collection,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Builty } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BuiltyDetail() {
  const { builtyId } = useParams<{ builtyId: string }>();
  const navigate = useNavigate();
  const { user, quotaExceeded } = useAuth();
  const pageRef = React.useRef<HTMLDivElement>(null);
  
  const [builty, setBuilty] = useState<Builty | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [editFormData, setEditFormData] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(data.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => {
      console.warn('Failed to fetch products:', error);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (builty && isEditingItems) {
      setEditFormData(builty.items || []);
    }
  }, [builty, isEditingItems]);

  useEffect(() => {
    if (!user || !builtyId) return;

    const unsubscribe = onSnapshot(doc(db, 'builties', builtyId), (snapshot) => {
      if (snapshot.exists()) {
        setBuilty({ id: snapshot.id, ...snapshot.data() } as Builty);
      } else {
        toast.error('Builty not found');
        navigate('/builties');
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `builties/${builtyId}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, builtyId, navigate]);

  const updateStatus = async (newStatus: Builty['status']) => {
    if (!builty) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    try {
      await updateDoc(doc(db, 'builties', builty.id), {
        status: newStatus
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleUpdateItems = async () => {
    if (!builty) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    
    try {
      const totalItems = editFormData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      await updateDoc(doc(db, 'builties', builty.id), {
        items: editFormData,
        totalItems
      });
      toast.success('Items updated successfully');
      setIsEditingItems(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update items');
    }
  };

  const downloadAsImage = () => {
    if (!pageRef.current) return;
    
    toast.loading('Exporting builty record...');
    const element = pageRef.current;
    toPng(element, { 
      backgroundColor: '#f8fafc', 
      cacheBust: true,
      pixelRatio: 2,
      width: element.scrollWidth,
      height: element.scrollHeight
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `Builty_${builty?.builtyNumber || 'Details'}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Builty record captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDelete = async () => {
    if (!builty) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'builties', builty.id));
      toast.success('Builty record deleted successfully');
      navigate('/builties');
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'resource-exhausted') {
        toast.error('Quota Limit: Cannot delete from cloud.');
      } else {
        toast.error('Failed to delete builty record');
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!builty) return null;

  return (
    <div className="space-y-6 pb-12 print:p-0">
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => navigate('/builties')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Builty Details</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> Last Updated {format(builty.createdAt.toDate(), 'PPP')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2 text-destructive border-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete Record
          </Button>
          <Button onClick={handlePrint} variant="outline" className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button onClick={downloadAsImage} variant="outline" className="gap-2">
            <ImageIcon className="w-4 h-4" /> Download Picture
          </Button>
        </div>
      </div>

      <div ref={pageRef} className="space-y-6 print:space-y-4 print:p-8">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consignment Number</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{builty.builtyNumber}</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {format(builty.date.toDate(), 'dd MMMM yyyy')}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transport Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xl font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                {builty.transportName || 'N/A'}
              </div>
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {builty.destination}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 print:hidden">
                  <Select value={builty.status} onValueChange={(val: any) => updateStatus(val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                   {getStatusBadge(builty.status)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          <div className="md:col-span-8 space-y-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Consignment Parties
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-8 py-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">From (Sender)</h4>
                    <div className="p-4 rounded-xl bg-accent/30 border border-border/50">
                      <p className="text-lg font-bold">{builty.senderName}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">Direct Shipment from Warehouse</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">To (Receiver)</h4>
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <p className="text-lg font-bold text-primary">{builty.receiverName}</p>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {builty.destination}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                   <Package className="w-5 h-5 text-primary" />
                   Itemized Consignment
                </CardTitle>
                <div className="flex items-center gap-2 print:hidden">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 gap-1 border-primary/20 hover:bg-primary/5 text-primary"
                    onClick={() => setIsEditingItems(true)}
                  >
                    <Edit2 className="w-3 h-3" /> Manage Items
                  </Button>
                  <div className="relative w-40">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter..."
                      className="pl-8 h-8 text-xs"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                 <div className="space-y-6">
                   <div className="rounded-lg border border-border/50 overflow-hidden">
                     <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="h-9 text-[10px] font-black uppercase tracking-tighter">Product Name</TableHead>
                            <TableHead className="h-9 text-[10px] font-black uppercase tracking-tighter text-center">Qty</TableHead>
                            <TableHead className="h-9 text-[10px] font-black uppercase tracking-tighter text-right">Unit Price</TableHead>
                            <TableHead className="h-9 text-[10px] font-black uppercase tracking-tighter text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {builty.items && builty.items.length > 0 ? (
                            builty.items
                              .filter(item => item.productName.toLowerCase().includes(itemSearch.toLowerCase()))
                              .map((item, idx) => (
                                <TableRow key={idx} className="hover:bg-accent/10">
                                  <TableCell className="py-2.5 font-medium">{item.productName}</TableCell>
                                  <TableCell className="py-2.5 text-center font-bold text-primary">{item.quantity}</TableCell>
                                  <TableCell className="py-2.5 text-right font-mono text-xs">Rs. {item.price.toLocaleString()}</TableCell>
                                  <TableCell className="py-2.5 text-right font-bold">Rs. {(item.quantity * item.price).toLocaleString()}</TableCell>
                                </TableRow>
                              ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic text-xs">
                                No itemized products recorded. Showing summary data only.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                     </Table>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1 text-center p-3 rounded-lg bg-accent/20 border border-border/30">
                         <p className="text-xs font-medium text-muted-foreground uppercase">Grand Items</p>
                         <p className="text-2xl font-bold">{builty.totalItems}</p>
                      </div>
                      <div className="space-y-1 text-center p-3 rounded-lg bg-accent/20 border border-border/30">
                         <p className="text-xs font-medium text-muted-foreground uppercase">Base Rate</p>
                         <p className="text-2xl font-bold">Rs. {(builty.unitPrice || 0).toLocaleString()}</p>
                      </div>
                      <div className="space-y-1 text-center p-3 rounded-lg bg-accent/20 border border-border/30">
                         <p className="text-xs font-medium text-muted-foreground uppercase">Total Weight</p>
                         <p className="text-2xl font-bold">{builty.weight || 'N/A'}</p>
                      </div>
                      <div className="space-y-1 text-center p-3 rounded-lg bg-primary/10 border border-primary/20">
                         <p className="text-xs font-medium text-primary uppercase">Freight Cost</p>
                         <p className="text-2xl font-bold text-primary">Rs. {builty.freightAmount.toLocaleString()}</p>
                      </div>
                   </div>
                 </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-4 space-y-6">
             <Card className="border-border/50 bg-card/50 backdrop-blur-sm print:shadow-none print:border-none">
               <CardHeader>
                 <CardTitle className="text-lg font-semibold">Consignment Notes</CardTitle>
               </CardHeader>
               <CardContent>
                  <div className="p-4 rounded-lg bg-accent/50 border border-border/50 text-sm italic text-muted-foreground min-h-[150px]">
                     {builty.notes || 'No special instructions provided for this consignment.'}
                  </div>
               </CardContent>
             </Card>

             <div className="p-6 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground space-y-4 shadow-xl shadow-primary/20 print:hidden">
                <div className="flex items-center gap-3">
                   <div className="p-2 rounded-lg bg-white/20">
                      <Truck className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-bold">Tracking Status</h3>
                      <p className="text-xs text-white/70">Real-time logistics update</p>
                   </div>
                </div>
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/30">
                   <div className="flex gap-3 items-start relative">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10", builty.status !== 'pending' ? 'bg-emerald-400' : 'bg-white/20')}>
                         <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                         <p className="text-xs font-bold">Consignment Booked</p>
                         <p className="text-[10px] opacity-70">{format(builty.createdAt.toDate(), 'HH:mm, dd MMM')}</p>
                      </div>
                   </div>
                   <div className="flex gap-3 items-start relative">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10", ['in-transit', 'delivered'].includes(builty.status) ? 'bg-emerald-400' : 'bg-white/20')}>
                         <Truck className="w-4 h-4 text-white" />
                      </div>
                      <div>
                         <p className="text-xs font-bold">In Transit</p>
                         <p className="text-[10px] opacity-70">Dispatched from Source</p>
                      </div>
                   </div>
                   <div className="flex gap-3 items-start relative">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10", builty.status === 'delivered' ? 'bg-emerald-400' : 'bg-white/20')}>
                         <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                      <div>
                         <p className="text-xs font-bold">Delivered</p>
                         <p className="text-[10px] opacity-70">Awaiting Confirmation</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanent Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete builty <strong>{builty.builtyNumber}</strong>? This action cannot be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Items Dialog */}
      <Dialog open={isEditingItems} onOpenChange={setIsEditingItems}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Manage Consignment Items
            </DialogTitle>
            <DialogDescription>
              Add or remove products from this consignment.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[50vh] overflow-y-auto space-y-4 py-4 pr-1">
            {editFormData.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/30 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No items added yet</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => setEditFormData([{ productId: '', productName: '', quantity: 1, price: 0 }])}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add First Item
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {editFormData.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 rounded-xl bg-muted/30 border border-border/50 relative">
                    <div className="col-span-6 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Product</label>
                      <Select 
                        value={item.productId} 
                        onValueChange={(val) => {
                          const prod = products.find(p => p.id === val);
                          const next = [...editFormData];
                          next[index] = { 
                            ...next[index], 
                            productId: val, 
                            productName: prod?.name || '',
                            price: prod?.price || 0
                          };
                          setEditFormData(next);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Qty</label>
                      <Input 
                        type="number" 
                        className="h-9 text-center font-bold" 
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...editFormData];
                          next[index].quantity = Math.max(1, Number(e.target.value));
                          setEditFormData(next);
                        }}
                      />
                    </div>
                    <div className="col-span-3 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Price</label>
                      <Input 
                        type="number" 
                        className="h-9" 
                        value={item.price}
                        onChange={(e) => {
                          const next = [...editFormData];
                          next[index].price = Number(e.target.value);
                          setEditFormData(next);
                        }}
                      />
                    </div>
                    <div className="col-span-1 pb-0.5">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => setEditFormData(editFormData.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button 
                  variant="outline" 
                  className="w-full h-10 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => setEditFormData([...editFormData, { productId: '', productName: '', quantity: 1, price: 0 }])}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add More Items
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setIsEditingItems(false)}>Cancel</Button>
            <Button onClick={handleUpdateItems} className="gap-2">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const getStatusBadge = (status: Builty['status']) => {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="gap-2 h-7 px-3"><Clock className="w-3.5 h-3.5" /> Pending</Badge>;
    case 'in-transit': return <Badge variant="secondary" className="gap-2 h-7 px-3 bg-blue-100 text-blue-700 hover:bg-blue-200 uppercase tracking-tighter font-black"><Truck className="w-3.5 h-3.5" /> In Transit</Badge>;
    case 'delivered': return <Badge variant="secondary" className="gap-2 h-7 px-3 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 uppercase tracking-tighter font-black"><CheckCircle2 className="w-3.5 h-3.5" /> Delivered</Badge>;
    case 'cancelled': return <Badge variant="destructive" className="gap-2 h-7 px-3 uppercase tracking-tighter font-black"><AlertCircle className="w-3.5 h-3.5" /> Cancelled</Badge>;
  }
};
