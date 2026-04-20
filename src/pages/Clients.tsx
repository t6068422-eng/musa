import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  User, 
  Phone, 
  Mail, 
  MapPin,
  MoreVertical,
  Edit2,
  Trash2,
  CreditCard,
  FileText,
  DollarSign,
  Undo2,
  Download
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy,
  writeBatch,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Client } from '../types';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [adjustingClient, setAdjustingClient] = useState<Client | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Client; direction: 'asc' | 'desc' } | null>(null);
  const [undoStack, setUndoStack] = useState<{ type: string; data: any }[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const tableRef = React.useRef<HTMLDivElement>(null);

  const pushToUndo = (action: { type: string; data: any }) => {
    setUndoStack(prev => {
      const newStack = [action, ...prev];
      return newStack.slice(0, 10); // Keep last 10 steps
    });
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[0];
    const remainingStack = undoStack.slice(1);

    try {
      if (lastAction.type === 'delete') {
        const clientData = lastAction.data;
        const { id, ...rest } = clientData;
        await setDoc(doc(db, 'clients', id), rest);
        toast.success(`Restored client: ${clientData.name}`);
      } else if (lastAction.type === 'edit' || lastAction.type === 'adjust') {
        const { id, prevState } = lastAction.data;
        await updateDoc(doc(db, 'clients', id), prevState);
        toast.success(`Reverted changes for ${prevState.name}`);
      } else if (lastAction.type === 'add') {
        await deleteDoc(doc(db, 'clients', lastAction.data.id));
        toast.success(`Removed added client: ${lastAction.data.name}`);
      }
      setUndoStack(remainingStack);
    } catch (error) {
      console.error(error);
      toast.error('Failed to undo last action');
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    creditBalance: 0
  });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.name || !formData.phone) {
      return toast.error('Name and Phone are required');
    }

    try {
      if (editingClient) {
        const clientRef = doc(db, 'clients', editingClient.id);
        const prevState = {
          name: editingClient.name,
          phone: editingClient.phone,
          email: editingClient.email || '',
          address: editingClient.address || '',
          creditBalance: editingClient.creditBalance || 0
        };
        
        await updateDoc(clientRef, {
          ...formData,
          creditBalance: Number(formData.creditBalance)
        });
        
        pushToUndo({ type: 'edit', data: { id: editingClient.id, prevState } });
        toast.success('Client updated successfully');
      } else {
        const docRef = await addDoc(collection(db, 'clients'), {
          ...formData,
          creditBalance: Number(formData.creditBalance),
          createdAt: Timestamp.now(),
          totalSpent: 0,
          totalQuantity: 0,
          lastPurchaseDate: null
        });
        
        pushToUndo({ type: 'add', data: { id: docRef.id, name: formData.name } });
        toast.success('Client added successfully');
      }
      setIsAddDialogOpen(false);
      setEditingClient(null);
      setFormData({ name: '', phone: '', email: '', address: '', creditBalance: 0 });
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to save client');
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingClient) return;

    try {
      const clientRef = doc(db, 'clients', adjustingClient.id);
      const currentBalance = adjustingClient.creditBalance || 0;
      const newBalance = currentBalance + Number(adjustmentAmount);

      await updateDoc(clientRef, { creditBalance: newBalance });
      
      pushToUndo({ 
        type: 'adjust', 
        data: { 
          id: adjustingClient.id, 
          prevState: { ...adjustingClient, creditBalance: currentBalance } 
        } 
      });
      
      toast.success(`Balance adjusted: New balance Rs. ${newBalance.toLocaleString()}`);
      setAdjustingClient(null);
      setAdjustmentAmount(0);
    } catch (error) {
      toast.error('Failed to adjust balance');
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      await deleteDoc(doc(db, 'clients', clientToDelete.id));
      pushToUndo({ type: 'delete', data: clientToDelete });
      toast.success('Client deleted successfully');
      setClientToDelete(null);
    } catch (error) {
      toast.error('Failed to delete client');
    }
  };

  const requestSort = (key: keyof Client) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredClients = clients
    .filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      
      let aVal: any = a[key];
      let bVal: any = b[key];

      if (key === 'lastPurchaseDate' || key === 'createdAt') {
        aVal = (aVal as Timestamp)?.toMillis() || 0;
        bVal = (bVal as Timestamp)?.toMillis() || 0;
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
        link.download = `ClientDirectory_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Image downloaded successfully');
      })
      .catch((err) => {
        console.error('oops, something went wrong!', err);
        toast.dismiss();
        toast.error('Failed to download image');
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Management</h2>
          <p className="text-muted-foreground">Maintain your client database and track their activity.</p>
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
              setEditingClient(null);
              setFormData({ name: '', phone: '', email: '', address: '', creditBalance: 0 });
            }
          }}>
            <DialogTrigger render={<Button className="gap-2 bg-primary text-primary-foreground" />}>
              <Plus className="w-4 h-4" /> New Client
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              <DialogDescription>
                Enter the client's information below.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddClient} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="e.g. John Doe"
                  required 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input 
                  id="phone" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  placeholder="e.g. +92 300 0000000"
                  required 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input 
                  id="address" 
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})} 
                  placeholder="Street, City, Country"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="creditBalance">Initial Credit Balance</Label>
                <Input 
                  id="creditBalance" 
                  type="number"
                  value={formData.creditBalance} 
                  onChange={e => setFormData({...formData, creditBalance: Number(e.target.value)})} 
                  placeholder="0.00"
                />
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">
                  {editingClient ? 'Update Client' : 'Save Client'}
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
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              Rs. {clients.reduce((sum, c) => sum + (c.creditBalance || 0), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Client Directory
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                className="pl-9 h-9"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0" ref={tableRef}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('name')}>
                    Client Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Contact Info</TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('creditBalance')}>
                    Credit Balance {sortConfig?.key === 'creditBalance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('totalSpent')}>
                    Total Purchases {sortConfig?.key === 'totalSpent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('lastPurchaseDate')}>
                    Last Purchase {sortConfig?.key === 'lastPurchaseDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No clients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/clients/${client.id}`)}>
                      <TableCell>
                        <div className="font-medium">{client.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{client.address || 'No address'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Phone className="w-3 h-3" /> {client.phone}
                          </div>
                          {client.email && (
                            <div className="flex items-center gap-2 text-xs">
                              <Mail className="w-3 h-3" /> {client.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn(
                          "font-bold",
                          (client.creditBalance || 0) > 0 ? "text-destructive" : "text-emerald-500"
                        )}>
                          Rs. {(client.creditBalance || 0).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-primary">
                          Rs. {(client.totalSpent || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {client.totalQuantity || 0} Total Units
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {client.lastPurchaseDate 
                          ? format(client.lastPurchaseDate.toDate(), 'PPP') 
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                            <MoreVertical className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditingClient(client);
                              setFormData({
                                name: client.name,
                                phone: client.phone,
                                email: client.email || '',
                                address: client.address || '',
                                creditBalance: client.creditBalance || 0
                              });
                              setIsAddDialogOpen(true);
                            }} className="gap-2">
                              <Edit2 className="w-4 h-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)} className="gap-2">
                              <FileText className="w-4 h-4" /> View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setAdjustingClient(client);
                              setAdjustmentAmount(0);
                            }} className="gap-2">
                              <DollarSign className="w-4 h-4" /> Adjust Balance
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => setClientToDelete(client)}>
                              <Trash2 className="w-4 h-4" /> Delete
                            </DropdownMenuItem>
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
      <Dialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete the client record for <strong>{clientToDelete?.name}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteClient}>Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog */}
      <Dialog open={!!adjustingClient} onOpenChange={(open) => !open && setAdjustingClient(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Credit Balance</DialogTitle>
            <DialogDescription>
              Update the outstanding balance for <strong>{adjustingClient?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjustBalance} className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-lg flex justify-between items-center">
              <span className="text-sm font-medium">Current Balance:</span>
              <span className={cn(
                "text-lg font-bold",
                (adjustingClient?.creditBalance || 0) > 0 ? "text-destructive" : "text-emerald-500"
              )}>
                Rs. {(adjustingClient?.creditBalance || 0).toLocaleString()}
              </span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adjustmentAmount">Adjustment Amount</Label>
              <Input
                id="adjustmentAmount"
                type="number"
                placeholder="e.g. -500 for payment, 500 for credit"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">
                Enter negative value for payments (reduces balance), positive for new credit (increases balance).
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Confirm Adjustment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
