import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2,
  Package,
  AlertCircle,
  Image as ImageIcon,
  Download
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product } from '../types';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { toPng } from 'html-to-image';
import { format } from 'date-fns';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user, isAdmin } = useAuth();
  const tableRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = () => {
    if (!tableRef.current) return;
    
    toast.loading('Capturing product list...');
    toPng(tableRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `ProductList_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Product list captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: '',
    minStockLevel: 0,
    currentStock: 0,
    price: 0
  });

  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Fetch Settings
    const settingsRef = doc(db, 'settings', 'stockControl');
    const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setCustomColumns(doc.data().customColumns || []);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/stockControl');
    });

    const q = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => {
      unsubscribeSettings();
      unsubscribeProducts();
    };
  }, [user]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return toast.error('Only admins can add products');

    try {
      await addDoc(collection(db, 'products'), {
        ...formData,
        minStockLevel: Number(formData.minStockLevel),
        currentStock: Number(formData.currentStock),
        price: Number(formData.price),
        availableStock: 0, // Initialize available stock
        createdAt: Timestamp.now()
      });
      toast.success('Product added successfully');
      setIsAddDialogOpen(false);
      setFormData({ name: '', category: '', unit: '', minStockLevel: 0, currentStock: 0, price: 0 });
    } catch (error: any) {
      toast.error('Failed to add product');
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        ...formData,
        minStockLevel: Number(formData.minStockLevel),
        currentStock: Number(formData.currentStock),
        price: Number(formData.price)
      });
      toast.success('Product updated successfully');
      setEditingProduct(null);
    } catch (error: any) {
      toast.error('Failed to update product');
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    if (!isAdmin) return toast.error('Only admins can delete products');

    try {
      await deleteDoc(doc(db, 'products', productToDelete));
      toast.success('Product deleted');
      setProductToDelete(null);
    } catch (error: any) {
      toast.error('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground">Manage your inventory items and stock levels.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={downloadAsImage} variant="outline" className="gap-2">
            <ImageIcon className="w-4 h-4" /> Download Picture
          </Button>
          {isAdmin && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger render={<Button className="gap-2" />}>
              <Plus className="w-4 h-4" /> Add Product
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>Enter the details for the new inventory item.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddProduct} className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unit">Unit (e.g. Kg, Pcs)</Label>
                    <Input id="unit" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="minStock">Min Stock Level</Label>
                    <Input id="minStock" type="number" value={formData.minStockLevel} onChange={e => setFormData({...formData, minStockLevel: Number(e.target.value)})} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="initialStock">Initial Stock</Label>
                    <Input id="initialStock" type="number" value={formData.currentStock} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="price">Base Price (PKR)</Label>
                    <Input id="price" type="number" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Save Product</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>

      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50 backdrop-blur-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-10" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      <div ref={tableRef} className="space-y-6">
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Product Name</TableHead>
                <TableHead className="min-w-[120px]">Category</TableHead>
                <TableHead className="min-w-[120px]">Current Stock</TableHead>
                <TableHead className="min-w-[100px]">Base Price</TableHead>
                {customColumns.map(col => (
                  <TableHead key={col} className="min-w-[100px]">{col}</TableHead>
                ))}
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6 + customColumns.length} className="text-center py-8 text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => {
                  const isLowStock = product.currentStock <= product.minStockLevel;
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product.currentStock} {product.unit}
                          {isLowStock && <AlertCircle className="w-4 h-4 text-red-500" />}
                        </div>
                      </TableCell>
                      <TableCell>Rs. {(product.price || 0).toLocaleString()}</TableCell>
                      {customColumns.map(col => (
                        <TableCell key={col}>{product.customFields?.[col] || '-'}</TableCell>
                      ))}
                      <TableCell>
                        <Badge variant={isLowStock ? "destructive" : "secondary"}>
                          {isLowStock ? "Low Stock" : "In Stock"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => {
                              setEditingProduct(product);
                              setFormData({
                                name: product.name,
                                category: product.category,
                                unit: product.unit,
                                minStockLevel: product.minStockLevel,
                                currentStock: product.currentStock,
                                price: product.price || 0
                              });
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:bg-destructive/10 h-10 w-10"
                              onClick={() => setProductToDelete(product.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setProductToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProduct}>Delete Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update the details for the inventory item.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProduct} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Product Name</Label>
              <Input id="edit-name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input id="edit-category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-unit">Unit</Label>
                <Input id="edit-unit" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-minStock">Min Stock Level</Label>
                <Input id="edit-minStock" type="number" value={formData.minStockLevel} onChange={e => setFormData({...formData, minStockLevel: Number(e.target.value)})} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-stock">Current Stock</Label>
                <Input id="edit-stock" type="number" value={formData.currentStock} onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Update Product</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
