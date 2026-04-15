import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Save, 
  Download, 
  Search, 
  Calendar as CalendarIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  X,
  History,
  Eye,
  User as UserIcon
} from 'lucide-react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  Timestamp,
  query,
  orderBy,
  writeBatch,
  setDoc,
  getDoc,
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, AppSettings, StockEntry } from '../types';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

export default function StockControl() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [entries, setEntries] = useState<Record<string, StockEntry>>({});
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [recentHistory, setRecentHistory] = useState<any[]>([]);
  const { user, isAdmin, profile } = useAuth();

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

    // Fetch Products
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productsData);
      
      // Initialize entries if not already set
      setEntries(prev => {
        const updated: Record<string, StockEntry> = {};
        productsData.forEach(p => {
          updated[p.id] = {
            productId: p.id,
            production: prev[p.id]?.production || 0,
            qtySold: prev[p.id]?.qtySold || 0,
            price: prev[p.id]?.price || 0,
            preparedStock: prev[p.id]?.preparedStock !== undefined ? prev[p.id].preparedStock : p.currentStock,
            customFields: { ...(p.customFields || {}), ...(prev[p.id]?.customFields || {}) }
          };
        });
        return updated;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    // Fetch Recent History
    const historyQ = query(collection(db, 'stockControlHistory'), orderBy('date', 'desc'), limit(5));
    const unsubscribeHistory = onSnapshot(historyQ, (snapshot) => {
      setRecentHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockControlHistory');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeProducts();
      unsubscribeHistory();
    };
  }, [user]);

  const handleEntryChange = (productId: string, field: 'production' | 'qtySold' | 'preparedStock' | 'price', value: string) => {
    const numValue = value === '' ? 0 : Number(value);
    setEntries(prev => {
      const currentEntry = prev[productId];
      let newPreparedStock = currentEntry.preparedStock;

      // If production changes, update preparedStock accordingly
      if (field === 'production') {
        const diff = numValue - currentEntry.production;
        newPreparedStock += diff;
      }

      return {
        ...prev,
        [productId]: {
          ...currentEntry,
          [field]: numValue,
          preparedStock: newPreparedStock
        }
      };
    });
  };

  const handleProductNameChange = (productId: string, newName: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, name: newName } : p));
  };

  const handleCustomFieldChange = (productId: string, columnName: string, value: string) => {
    setEntries(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        customFields: {
          ...prev[productId].customFields,
          [columnName]: value
        }
      }
    }));
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    if (customColumns.includes(newColumnName.trim())) {
      return toast.error('Column already exists');
    }

    try {
      const settingsRef = doc(db, 'settings', 'stockControl');
      const updatedColumns = [...customColumns, newColumnName.trim()];
      await setDoc(settingsRef, { customColumns: updatedColumns }, { merge: true });
      setCustomColumns(updatedColumns);
      setNewColumnName('');
      setIsAddColumnOpen(false);
      toast.success('Column added successfully');
    } catch (error) {
      toast.error('Failed to add column');
    }
  };

  const handleRemoveColumn = async (columnName: string) => {
    try {
      const settingsRef = doc(db, 'settings', 'stockControl');
      const updatedColumns = customColumns.filter(c => c !== columnName);
      await setDoc(settingsRef, { customColumns: updatedColumns }, { merge: true });
      setCustomColumns(updatedColumns);
      toast.success('Column removed');
    } catch (error) {
      toast.error('Failed to remove column');
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;
    try {
      const productsRef = collection(db, 'products');
      await setDoc(doc(productsRef), {
        name: quickAddName.trim(),
        category: 'General',
        unit: 'pcs',
        minStockLevel: 0,
        currentStock: 0,
        availableStock: 0,
        createdAt: Timestamp.now()
      });
      setQuickAddName('');
      toast.success('Product added');
    } catch (error) {
      toast.error('Failed to add product');
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const batch = writeBatch(db);
      const now = Timestamp.now();
      const productIds = Object.keys(entries);
      
      for (const productId of productIds) {
        const entry = entries[productId];
        const product = products.find(p => p.id === productId);
        if (!product) continue;
        
        const productRef = doc(db, 'products', productId);
        const newStock = entry.preparedStock - entry.qtySold;

        // 1. Log Production if any
        if (entry.production > 0) {
          const productionRef = doc(collection(db, 'production'));
          batch.set(productionRef, {
            productId,
            productName: product.name,
            quantity: entry.production,
            date: now,
            addedBy: user.uid
          });
        }

        // 2. Log Sale if any
        if (entry.qtySold > 0) {
          const saleRef = doc(collection(db, 'sales'));
          const total = entry.qtySold * entry.price;
          batch.set(saleRef, {
            productId,
            productName: product.name,
            quantity: entry.qtySold,
            price: entry.price,
            total: total,
            date: now,
            soldBy: user.uid
          });
        }

        // 3. Update Product Stock, Name, and Custom Fields
        batch.update(productRef, { 
          name: product.name,
          currentStock: newStock,
          customFields: entry.customFields 
        });
      }

      // 4. Save History Record
      const historyRef = doc(collection(db, 'stockControlHistory'));
      batch.set(historyRef, {
        date: now,
        savedBy: user.uid,
        savedByName: profile?.name || 'User',
        entries: Object.values(entries).map((e: StockEntry) => ({
          productId: e.productId,
          production: e.production,
          qtySold: e.qtySold,
          price: e.price,
          preparedStock: e.preparedStock,
          customFields: e.customFields,
          productName: products.find(p => p.id === e.productId)?.name || 'Unknown'
        })),
        customColumns
      });

      await batch.commit();

      toast.success('Stock control data saved successfully');
      
      // Reset numeric entries (production/qtySold) but keep preparedStock as the new base
      setEntries(prev => {
        const reset = { ...prev };
        Object.keys(reset).forEach(id => {
          reset[id].production = 0;
          reset[id].qtySold = 0;
        });
        return reset;
      });
      
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to save stock control data');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    const now = new Date();
    const dateStr = format(now, 'yyyy-MM-dd');
    const timeStr = format(now, 'HH-mm-ss');
    const dayStr = format(now, 'EEEE');
    
    const customHeaders = customColumns.length > 0 ? `,${customColumns.join(',')}` : '';
    const header = `Product,Prepared Stock,Production,Qty Sold,Price,Revenue,New Prepared Stock,Status${customHeaders}\n`;
    
    const rows = products.map(p => {
      const entry = entries[p.id] || { production: 0, qtySold: 0, price: 0, preparedStock: p.currentStock, customFields: {} };
      const newStock = entry.preparedStock - entry.qtySold;
      const revenue = entry.qtySold * entry.price;
      const status = newStock <= p.minStockLevel ? "Low Stock" : "In Stock";
      const customData = customColumns.map(c => `"${entry.customFields[c] || ''}"`).join(',');
      const customDataStr = customData ? `,${customData}` : '';
      
      return `"${p.name}",${entry.preparedStock},${entry.production},${entry.qtySold},${entry.price},${revenue},${newStock},"${status}"${customDataStr}`;
    }).join("\n");

    const content = `MUSA TRADERS - STOCK CONTROL SHEET\nDate: ${dateStr}\nDay: ${dayStr}\nTime: ${timeStr}\n\n${header}${rows}`;
    
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Stock_Control_${dateStr}_${timeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-[95vw] mx-auto">
      {/* Header matching the image style */}
      <div className="border-2 border-green-800 rounded-lg overflow-hidden shadow-lg">
        <div className="bg-[#38761d] text-white text-center py-2 font-bold text-xl border-b-2 border-green-800">
          MUSA TRADERS
        </div>
        <div className="bg-[#38761d] text-white text-center py-1 font-bold border-b-2 border-green-800">
          STOCK CONTROL SHEET
        </div>
        <div className="grid grid-cols-2 bg-[#6aa84f] text-black font-bold">
          <div className="border-r-2 border-green-800 py-1 text-center">DATE</div>
          <div className="py-1 text-center">{format(new Date(), 'dd-MMM-yy')}</div>
        </div>
      </div>

      <div className="flex justify-between items-center gap-4">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-10" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button 
          variant="outline" 
          className="gap-2 border-green-800 text-green-800 hover:bg-green-50"
          onClick={() => setIsAddColumnOpen(true)}
        >
          <PlusCircle className="w-4 h-4" />
          Create Column
        </Button>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="border-collapse min-w-full">
              <TableHeader>
                <TableRow className="bg-[#93c47d] hover:bg-[#93c47d] border-b-2 border-green-800">
                  <TableHead className="text-black font-bold text-center border-r border-green-800 min-w-[150px]">Product</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Prepared Stock</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Production</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Qty Sold</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Price</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Revenue</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">New Stock</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800">Status</TableHead>
                  {customColumns.map(column => (
                    <TableHead key={column} className="text-black font-bold text-center border-r border-green-800 min-w-[120px] relative group">
                      {column}
                      <button 
                        onClick={() => handleRemoveColumn(column)}
                        className="absolute -top-1 -right-1 hidden group-hover:flex bg-red-500 text-white rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </TableHead>
                  ))}
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
                    const entry = entries[product.id] || { production: 0, qtySold: 0, price: 0, preparedStock: product.currentStock, customFields: {} };
                    const newStock = entry.preparedStock - entry.qtySold;
                    const revenue = entry.qtySold * entry.price;
                    const isLowStock = newStock <= product.minStockLevel;
                    
                    return (
                      <TableRow key={product.id} className="hover:bg-accent/5 border-b border-green-800/30">
                        <TableCell className="font-bold text-left border-r border-green-800/30 p-1">
                          <Input 
                            className="w-full border-none bg-transparent focus-visible:ring-0 h-8 font-bold"
                            value={product.name}
                            onChange={(e) => handleProductNameChange(product.id, e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1 bg-blue-50/30">
                          <Input 
                            type="number" 
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-8 font-bold text-blue-700"
                            value={entry.preparedStock}
                            onChange={(e) => handleEntryChange(product.id, 'preparedStock', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="number" 
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-8"
                            value={entry.production || ''}
                            onChange={(e) => handleEntryChange(product.id, 'production', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="number" 
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-8"
                            value={entry.qtySold || ''}
                            onChange={(e) => handleEntryChange(product.id, 'qtySold', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="number" 
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-8"
                            value={entry.price || ''}
                            onChange={(e) => handleEntryChange(product.id, 'price', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 font-bold text-blue-600">
                          ${revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-center border-r border-green-800/30 font-bold ${newStock < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {newStock}
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30">
                          {isLowStock ? (
                            <Badge variant="destructive" className="text-[10px] h-5">LOW</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-5 bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>
                          )}
                        </TableCell>
                        {customColumns.map(column => (
                          <TableCell key={column} className="text-center border-r border-green-800/30 p-1">
                            <Input 
                              className="w-full mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-8"
                              value={entry.customFields[column] || ''}
                              onChange={(e) => handleCustomFieldChange(product.id, column, e.target.value)}
                              placeholder="..."
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
                {/* Quick Add Row */}
                <TableRow className="bg-accent/5 border-t-2 border-green-800/20">
                  <TableCell className="p-1 border-r border-green-800/30">
                    <div className="flex gap-2 items-center px-2">
                      <Input 
                        placeholder="Quick add product..." 
                        value={quickAddName}
                        onChange={e => setQuickAddName(e.target.value)}
                        className="h-8 text-sm border-dashed border-green-800/50"
                        onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                      />
                      <Button size="sm" variant="ghost" onClick={handleQuickAdd} className="h-8 px-2 text-green-700 hover:bg-green-100">
                        <PlusCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell colSpan={5 + customColumns.length} className="bg-accent/5" />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="p-6 bg-accent/5 flex flex-col md:flex-row items-center justify-center gap-4 border-t border-green-800/30">
            <p className="text-sm text-muted-foreground italic">
              Use the "Save Data" button below to record your daily changes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Recent Saves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center italic">No recent saves</p>
              ) : (
                recentHistory.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors border border-transparent hover:border-border/50">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{format(record.date.toDate(), 'dd MMM, hh:mm a')}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <UserIcon className="w-3 h-3" />
                        {record.savedByName}
                      </span>
                    </div>
                    <Link to="/saved-data">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                        <Eye className="w-3 h-3" />
                        View
                      </Button>
                    </Link>
                  </div>
                ))
              )}
              <Link to="/saved-data" className="block pt-2">
                <Button variant="link" className="w-full text-xs text-primary h-auto p-0">
                  View all saved data →
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Sheet Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button 
              className="w-full gap-2 bg-[#38761d] hover:bg-[#2d5e17] text-white shadow-lg shadow-green-900/20"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Data
            </Button>
            <Button 
              variant="outline" 
              className="w-full gap-2 border-green-800 text-green-800 hover:bg-green-50"
              onClick={downloadReport}
            >
              <Download className="w-5 h-5" />
              Download CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Add Column Dialog */}
      <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Column</DialogTitle>
            <DialogDescription>
              Add a custom data column to the stock control sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="colName">Column Name</Label>
              <Input 
                id="colName" 
                value={newColumnName}
                onChange={e => setNewColumnName(e.target.value)}
                placeholder="e.g. Batch No, Expiry, Remarks"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddColumnOpen(false)}>Cancel</Button>
            <Button onClick={handleAddColumn} className="bg-green-800 hover:bg-green-900">Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
