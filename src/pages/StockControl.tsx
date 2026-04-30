import React, { useState, useEffect, useRef } from 'react';
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
  Activity,
  FileBarChart,
  User as UserIcon,
  RefreshCw,
  ShoppingCart,
  Package
} from 'lucide-react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  Timestamp,
  addDoc,
  query,
  orderBy,
  writeBatch,
  updateDoc,
  setDoc,
  getDoc,
  limit,
  increment
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, AppSettings, StockEntry } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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

import { toPng } from 'html-to-image';

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
  const [editHistory, setEditHistory] = useState<{
    description: string;
    timestamp: number;
    entries: Record<string, StockEntry>;
    products: Product[];
  }[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [lastCommittedEntries, setLastCommittedEntries] = useState<Record<string, StockEntry>>({});
  const [quickEntrySearch, setQuickEntrySearch] = useState('');
  const [quickEntryProductId, setQuickEntryProductId] = useState('');
  const [quickEntryProduction, setQuickEntryProduction] = useState('');
  const [quickEntryQtySold, setQuickEntryQtySold] = useState('');
  const [showDetailedStock, setShowDetailedStock] = useState(true);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [manualDate, setManualDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { user, quotaExceeded, setQuotaExceeded } = useAuth();
  const isLocalChange = useRef(false);
  const productsRef = useRef<Product[]>([]);
  const stockAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const downloadAsImage = async () => {
    if (!stockAreaRef.current) return;
    
    toast.loading('Capturing stock sheet...');
    try {
      // Temporarily ensure full visibility for capture
      const element = stockAreaRef.current;
      const originalStyle = element.style.cssText;
      
      const dataUrl = await toPng(element, { 
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
        width: element.scrollWidth,
        height: element.scrollHeight,
        style: {
          borderRadius: '0px',
          margin: '0',
          padding: '20px'
        },
        filter: (node) => {
          // Skip elements that shouldn't be in the picture
          const exclusionClasses = ['no-capture', 'hidden-in-capture'];
          return !exclusionClasses.some(cls => (node as HTMLElement)?.classList?.contains(cls));
        }
      });
      
      const link = document.createElement('a');
      link.download = `StockControl_${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = dataUrl;
      link.click();
      toast.dismiss();
      toast.success('Stock control captured successfully');
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error('Failed to capture image');
    }
  };

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
    const q = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      const sortedProducts = productsData.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(sortedProducts);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
      setLoading(false);
    });

    // Fetch Recent History
    const historyQ = query(collection(db, 'stockControlHistory'), limit(5));
    const unsubscribeHistory = onSnapshot(historyQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRecentHistory(data.sort((a: any, b: any) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateB - dateA;
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockControlHistory');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeProducts();
      unsubscribeHistory();
    };
  }, [user]);

  // Cross-tab local sync (Zero-cost, saves quota)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `stockDraft_${user?.uid}` && e.newValue) {
        try {
          const cloudData = JSON.parse(e.newValue);
          // Only update if we don't have local changes to avoid overwriting current work
          if (!isLocalChange.current) {
            setEntries(cloudData.entries);
            if (cloudData.customColumns) setCustomColumns(cloudData.customColumns);
          }
        } catch (err) {
          console.error('Failed to parse storage sync:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user?.uid]);

  // Collaborative Draft (Live Sync & Restore)
  useEffect(() => {
    if (!user || products.length === 0) return;

    const initializeData = async () => {
      let loadedEntries: Record<string, StockEntry> = {};
      let loadedCols: string[] = [];
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // 1. Try local storage first (fastest)
      const saved = localStorage.getItem(`stockDraft_${user.uid}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Check if draft is from today. If not, we might want to clear production/sales
          const draftDate = parsed.timestamp ? format(new Date(parsed.timestamp), 'yyyy-MM-dd') : null;
          
          if (parsed.entries) {
            loadedEntries = parsed.entries;
            // If it's a new day, we reset production and sales but keep prices and custom fields
            if (draftDate && draftDate !== todayStr) {
               Object.keys(loadedEntries).forEach(id => {
                 loadedEntries[id].production = 0;
                 loadedEntries[id].qtySold = 0;
               });
            }
          }
          if (parsed.customColumns) loadedCols = parsed.customColumns;
        } catch (e) {
          console.error('Failed to parse localStorage draft:', e);
        }
      }

      // 2. Load from Cloud Draft to merge/restore
      try {
        const draftRef = doc(db, 'settings', 'stockControlDraft');
        const snap = await getDoc(draftRef);
        if (snap.exists()) {
          const data = snap.data();
          const cloudDraftDate = data.lastUpdated ? format(data.lastUpdated.toDate(), 'yyyy-MM-dd') : null;
          
          if (data.entries) {
            Object.keys(data.entries).forEach(id => {
              // Merge: favor existing local entries if they exist and we haven't saved to cloud yet
              if (!loadedEntries[id]) {
                loadedEntries[id] = data.entries[id];
                // Reset daily inputs if cloud draft is old
                if (cloudDraftDate && cloudDraftDate !== todayStr) {
                  loadedEntries[id].production = 0;
                  loadedEntries[id].qtySold = 0;
                }
              }
            });
          }
          if (data.customColumns && loadedCols.length === 0) loadedCols = data.customColumns;
        }
      } catch (err) {
        console.error('Failed to auto-load cloud draft:', err);
      }

      if (Object.keys(loadedEntries).length > 0) {
        setEntries(loadedEntries);
      }
      if (loadedCols.length > 0) {
        setCustomColumns(loadedCols);
      }
    };

    initializeData();
  }, [user, products.length]);

  // Sync entries to localStorage whenever they change locally (debounced)
  useEffect(() => {
    if (!user || products.length === 0) return;
    if (!isLocalChange.current) return;

    // Save to localStorage as a primary backup (zero cost + cross-tab sync)
    try {
      localStorage.setItem(`stockDraft_${user.uid}`, JSON.stringify({
        entries,
        customColumns,
        timestamp: Date.now()
      }));
      
      // Notify other tabs
      window.dispatchEvent(new StorageEvent('storage', {
        key: `stockDraft_${user.uid}`,
        newValue: localStorage.getItem(`stockDraft_${user.uid}`)
      }));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [entries, customColumns, user, products.length]);

  // Unified cross-tab storage listener
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `stockDraft_${user?.uid}` && e.newValue) {
        // IMPORTANT: Only update from other tabs if WE don't have unsaved changes
        // to prevent wiping current typing session.
        if (isLocalChange.current) return;

        try {
          const localData = JSON.parse(e.newValue);
          if (localData.entries) setEntries(localData.entries);
          if (localData.customColumns) setCustomColumns(localData.customColumns);
        } catch (err) {
          console.error('Failed to parse storage sync:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user?.uid]);

  // Cloud Draft Sync (onSnapshot) is REMOVED to preserve quota.
  // We only sync via the manualSyncDraft button which the user explicitly clicks.

  const manualSyncDraft = async () => {
    if (!user || products.length === 0) return;
    if (quotaExceeded) {
      toast.error('Quota Exceeded: Cloud features are limited for today. Data is safe in this browser.');
      return;
    }
    
    setLoading(true);
    const draftRef = doc(db, 'settings', 'stockControlDraft');
    try {
      await setDoc(draftRef, {
        entries,
        customColumns,
        lastUpdated: Timestamp.now(),
        updatedBy: user.uid
      }, { merge: true });

      localStorage.setItem(`lastSyncedEntries_${user.uid}`, JSON.stringify(entries));
      localStorage.setItem(`lastColumns_${user.uid}`, customColumns.join(','));

      isLocalChange.current = false;
      setQuotaExceeded(false);
      toast.success('Sync Successful: Cloud draft updated');
    } catch (error: any) {
      if (error?.code === 'resource-exhausted') {
        setQuotaExceeded(true);
        toast.error('Quota Limit Reached: Cloud sync disabled until tomorrow.');
      } else {
        toast.error('Sync Failed: Check your connection');
      }
    } finally {
      setLoading(false);
    }
  };

  const recordHistory = (description: string) => {
    setEditHistory(prev => {
      const newStep = {
        description,
        timestamp: Date.now(),
        entries: JSON.parse(JSON.stringify(entries)),
        products: JSON.parse(JSON.stringify(products))
      };
      return [newStep, ...prev].slice(0, 50); // Keep last 50 steps
    });
  };

  const handleUndo = (index: number) => {
    const step = editHistory[index];
    if (!step) return;

    isLocalChange.current = true;
    setEntries(JSON.parse(JSON.stringify(step.entries)));
    setProducts(JSON.parse(JSON.stringify(step.products)));
    
    // Remove all steps up to and including this one
    setEditHistory(prev => prev.slice(index + 1));
    toast.success(`Reverted to: ${step.description}`);
  };

  const handleClearInputs = async () => {
    recordHistory('Clear all production and sales inputs');
    
    isLocalChange.current = true;
    const updated: Record<string, StockEntry> = {};
    products.forEach(id => {
      const pId = typeof id === 'object' ? id.id : id;
      const product = products.find(p => p.id === pId);
      if (!product) return;

      updated[product.id] = {
        productId: product.id,
        production: 0,
        qtySold: 0,
        price: entries[product.id]?.price || 0,
        preparedStock: product.currentStock,
        customFields: Object.keys(entries[product.id]?.customFields || {}).reduce((acc, col) => ({...acc, [col]: ''}), {})
      };
    });

    setEntries(updated);
    setIsClearConfirmOpen(false);
    toast.success('Fields cleared successfully (Syncing with cloud in background)');
  };

  const handleEntryChange = (productId: string, field: 'production' | 'qtySold' | 'preparedStock' | 'price' | 'unitType', value: any) => {
    const isNumField = field !== 'unitType';
    const numValue = isNumField ? (value === '' ? 0 : Number(value)) : value;
    const product = products.find(p => p.id === productId);
    const productName = product?.name || 'Product';
    
    recordHistory(`Change ${field} for ${productName}`);
    isLocalChange.current = true;

    setEntries(prev => {
      const currentEntry = prev[productId] || {
        productId,
        production: 0,
        qtySold: 0,
        price: product?.price || 0,
        preparedStock: product?.currentStock || 0,
        unitType: 'piece',
        customFields: {}
      };
      let newPreparedStock = currentEntry.preparedStock;

      if (field === 'production') {
        const diff = Number(numValue) - currentEntry.production;
        newPreparedStock = Math.max(0, newPreparedStock + diff);
      } else if (field === 'preparedStock') {
        newPreparedStock = Number(numValue);
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

  // Debounce product name change to save quota
  const nameTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const handleProductNameChange = (productId: string, newName: string) => {
    // Update locally for immediate feedback
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, name: newName } : p));
    
    if (nameTimeoutRef.current) clearTimeout(nameTimeoutRef.current);
    
    nameTimeoutRef.current = setTimeout(async () => {
      if (quotaExceeded) {
        console.warn('Quota exceeded: Skipping product name cloud sync.');
        return;
      }
      try {
        const productRef = doc(db, 'products', productId);
        await updateDoc(productRef, { name: newName });
      } catch (error: any) {
        if (error?.code === 'resource-exhausted') {
          setQuotaExceeded(true);
        }
        console.error('Failed to update product name:', error);
      }
    }, 5000); // 5-second debounce for renames (up from 2s) to save quota
  };

  const handleCustomFieldChange = (productId: string, columnName: string, value: string) => {
    recordHistory(`Update ${columnName} for product`);
    isLocalChange.current = true;
    setEntries(prev => {
      const currentEntry = prev[productId] || {
        productId,
        production: 0,
        qtySold: 0,
        price: 0,
        preparedStock: products.find(p => p.id === productId)?.currentStock || 0,
        customFields: {}
      };
      return {
        ...prev,
        [productId]: {
          ...currentEntry,
          customFields: {
            ...currentEntry.customFields,
            [columnName]: value
          }
        }
      };
    });
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    if (customColumns.includes(newColumnName.trim())) {
      return toast.error('Column already exists');
    }

    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    isLocalChange.current = true;
    try {
      const settingsRef = doc(db, 'settings', 'stockControl');
      const updatedColumns = [...customColumns, newColumnName.trim()];
      // setDoc works offline and will sync when online
      await setDoc(settingsRef, { customColumns: updatedColumns }, { merge: true });
      setCustomColumns(updatedColumns);
      setNewColumnName('');
      setIsAddColumnOpen(false);
      toast.success('Column added (will sync when online)');
    } catch (error) {
      toast.error('Failed to add column');
    }
  };

  const handleRemoveColumn = async (columnName: string) => {
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    isLocalChange.current = true;
    try {
      const settingsRef = doc(db, 'settings', 'stockControl');
      const updatedColumns = customColumns.filter(c => c !== columnName);
      await setDoc(settingsRef, { customColumns: updatedColumns }, { merge: true });
      setCustomColumns(updatedColumns);
      toast.success('Column removed (will sync when online)');
    } catch (error) {
      toast.error('Failed to remove column');
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    try {
      const productsRef = collection(db, 'products');
      const newProductRef = doc(productsRef);
      await setDoc(newProductRef, {
        name: quickAddName.trim(),
        category: 'General',
        unit: 'pcs',
        minStockLevel: 0,
        currentStock: 0,
        availableStock: 0,
        price: 0,
        createdAt: Timestamp.now()
      });
      setQuickAddName('');
      toast.success('Product added (will sync when online)');
    } catch (error) {
      toast.error('Failed to add product');
    }
  };

  const handleQuickEntryAdd = () => {
    if (!quickEntryProductId) {
      toast.error('Please select a product from the list');
      return;
    }

    const prodAmount = Number(quickEntryProduction) || 0;
    const soldAmount = Number(quickEntryQtySold) || 0;

    if (prodAmount === 0 && soldAmount === 0) {
      toast.error('Please enter production or sales amount');
      return;
    }

    const product = products.find(p => p.id === quickEntryProductId);
    if (!product) return;

    recordHistory(`Quick add to ${product.name}: ${prodAmount} prod, ${soldAmount} sold`);
    isLocalChange.current = true;

    setEntries(prev => {
      const currentEntry = prev[quickEntryProductId] || { 
        productId: quickEntryProductId, 
        production: 0, 
        qtySold: 0, 
        price: product.price || 0,
        preparedStock: product.currentStock || 0,
        customFields: {} 
      };

      const newProd = currentEntry.production + prodAmount;
      const newSold = currentEntry.qtySold + soldAmount;
      
      // Calculate new preparedStock based on production change
      // Since we are adding prodAmount, the diff is simply prodAmount
      const newPreparedStock = Math.max(0, currentEntry.preparedStock + prodAmount);

      return {
        ...prev,
        [quickEntryProductId]: {
          ...currentEntry,
          production: newProd,
          qtySold: newSold,
          preparedStock: newPreparedStock
        }
      };
    });
    
    toast.success(`Updated ${product.name}: +${prodAmount} Prod, +${soldAmount} Sold`);
    
    setQuickEntryProduction('');
    setQuickEntryQtySold('');
    setQuickEntrySearch('');
    setQuickEntryProductId('');
  };

  const loadFromCloud = async () => {
    if (!user) return;
    setIsCloudLoading(true);
    try {
      const draftRef = doc(db, 'settings', 'stockControlDraft');
      const snap = await getDoc(draftRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.entries) {
          setEntries(data.entries);
          if (data.customColumns) setCustomColumns(data.customColumns);
          toast.success('Draft loaded from cloud');
          isLocalChange.current = false;
        } else {
          toast.info('No cloud draft found');
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load cloud draft');
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    if (quotaExceeded) {
      toast.error('Cloud Sync Disabled: Daily quota exceeded. Your data is safe in this browser.');
      return;
    }

    setLoading(true);
    
    try {
      const batch = writeBatch(db);
      const selectedDate = new Date(manualDate);
      // Set to current time if the date is today, otherwise use the selected date at noon
      const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      const timestampDate = isToday ? new Date() : new Date(selectedDate.setHours(12, 0, 0, 0));
      const now = Timestamp.fromDate(timestampDate);
      const dayId = format(selectedDate, 'yyyy-MM-dd');
      const productIds = Object.keys(entries);
      let haveMeaningfulCloudChanges = false;
      
      for (const productId of productIds) {
        const entry = entries[productId];
        if (!entry) continue; // Safety guard
        
        const product = products.find(p => p.id === productId);
        if (!product) continue;
        
        const lastCommitted = lastCommittedEntries[productId];
        const productRef = doc(db, 'products', productId);
        // Important: newStock is calculated based on current UI numbers
        const newStock = (entry.preparedStock || 0) - (entry.qtySold || 0);

        // 1. Log Production (Consolidated per day per product)
        // Skip if quantity matches what we already saved to the cloud successfully for this session
        if (entry.production > 0 && entry.production !== lastCommitted?.production) {
          const productionId = `${dayId}_${productId}`;
          const productionRef = doc(db, 'production', productionId);
          batch.set(productionRef, {
            productId,
            productName: product.name,
            quantity: entry.production,
            date: now,
            addedBy: user.uid
          });
          haveMeaningfulCloudChanges = true;
        }

        // 2. Log Sale (Consolidated per day per product)
        if (entry.qtySold > 0 && entry.qtySold !== lastCommitted?.qtySold) {
          const saleId = `${dayId}_${productId}`;
          const saleRef = doc(db, 'sales', saleId);
          const total = entry.qtySold * entry.price;
          batch.set(saleRef, {
            productId,
            productName: product.name,
            quantity: entry.qtySold,
            price: Number(entry.price) || 0,
            total: total,
            date: now,
            soldBy: user.uid
          });
          haveMeaningfulCloudChanges = true;
        }

        // 3. Update Product Stock, Name, Price, and Custom Fields
        const hasStockChange = newStock !== product.currentStock;
        const hasPriceChange = (Number(entry.price) || 0) !== (product.price || 0);
        const hasCustomFieldChange = JSON.stringify(entry.customFields || {}) !== JSON.stringify(product.customFields || {});

        if (hasStockChange || hasPriceChange || hasCustomFieldChange) {
          batch.update(productRef, { 
            currentStock: newStock,
            price: Number(entry.price) || 0,
            customFields: entry.customFields || {}
          });
          haveMeaningfulCloudChanges = true;
        }
      }

      // 4. Save History Record (One file per day)
      if (haveMeaningfulCloudChanges) {
        const historyRef = doc(db, 'stockControlHistory', dayId);
        const historyData = {
          date: now,
          savedBy: user.uid,
          savedByName: user?.displayName || user?.email?.split('@')[0] || 'User',
          entries: Object.keys(entries).map(pId => {
            const e = entries[pId];
            const product = products.find(p => p.id === pId);
            if (!e || !product) return null; // Only save existing products
            return {
              productId: e.productId,
              production: e.production || 0,
              qtySold: e.qtySold || 0,
              price: e.price || 0,
              preparedStock: e.preparedStock || 0,
              customFields: e.customFields || {},
              productName: product.name,
              imageUrl: product.imageUrl || ''
            };
          }).filter(Boolean),
          customColumns
        };
        batch.set(historyRef, historyData, { merge: true });

        await batch.commit();
        
        // Also update the cloud draft so other tabs/devices see the new state
        const draftRef = doc(db, 'settings', 'stockControlDraft');
        await setDoc(draftRef, {
          entries,
          customColumns,
          lastUpdated: Timestamp.now(),
          updatedBy: user.uid
        }, { merge: true });

        setLastCommittedEntries(JSON.parse(JSON.stringify(entries))); // Track what is now in cloud
        
        localStorage.setItem(`lastSyncedEntries_${user.uid}`, JSON.stringify(entries));
        localStorage.setItem(`lastColumns_${user.uid}`, customColumns.join(','));

        toast.success('Stock control data saved successfully');
      } else {
        toast.info('No new changes to save');
      }
      
      // Clear flags
      isLocalChange.current = false;
      setQuotaExceeded(false);

    } catch (error: any) {
      console.error(error);
      if (error?.code === 'resource-exhausted') {
        setQuotaExceeded(true);
        toast.error('Quota Exceeded: Cannot save to cloud today.');
      } else {
        toast.error('Failed to save stock control data');
      }
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
      const entry = entries[p.id] || { production: 0, qtySold: 0, price: 0, preparedStock: p.currentStock, unitType: 'piece', customFields: {} };
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
    <div className="space-y-6 max-w-full md:max-w-[95vw] mx-auto pb-20 md:pb-6" ref={stockAreaRef}>
      {/* Header matching the image style */}
      <div className="border-2 border-green-800 rounded-lg overflow-hidden shadow-lg">
        <div className="bg-[#38761d] text-white text-center py-2 font-bold text-lg md:text-xl border-b-2 border-green-800">
          MUSA TRADERS
        </div>
        <div className="bg-[#38761d] text-white text-center py-1 font-bold text-sm md:text-base border-b-2 border-green-800">
          STOCK CONTROL SHEET
        </div>
        <div className="grid grid-cols-2 bg-[#6aa84f] text-black font-bold text-sm md:text-base">
          <div className="border-r-2 border-green-800 py-1 text-center flex items-center justify-center gap-2">
            DATE
            <Input 
              type="date" 
              className="w-auto h-6 text-xs p-1 border-green-800 bg-white/50" 
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </div>
          <div className="py-1 text-center">{format(new Date(manualDate), 'dd-MMM-yy')}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-10 h-11 md:h-10" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            className={cn("flex-1 md:flex-none gap-2 h-11 md:h-10", showDetailedStock ? "border-green-600 text-green-700" : "border-slate-300 text-slate-500")}
            onClick={() => setShowDetailedStock(!showDetailedStock)}
          >
            {showDetailedStock ? <Eye className="w-4 h-4" /> : <Package className="w-4 h-4 opacity-50" />}
            <span className="hidden sm:inline">{showDetailedStock ? 'Stock Column ON' : 'Stock Column OFF'}</span>
            <span className="sm:hidden">{showDetailedStock ? 'Hide' : 'Show'} Stock</span>
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none gap-2 border-primary text-primary hover:bg-primary/5 h-11 md:h-10" onClick={downloadAsImage}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download Picture</span>
            <span className="sm:hidden">Pic</span>
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2 border-green-700 text-green-700 hover:bg-green-50 h-11 md:h-10 relative"
            onClick={manualSyncDraft}
            disabled={loading}
          >
            <Activity className={cn("w-4 h-4", isLocalChange.current && "animate-pulse text-blue-600")} />
            <span className="hidden sm:inline">
              {isLocalChange.current ? 'Cloud Sync Pending' : 'Cloud Draft Synced'}
            </span>
            <span className="sm:hidden">{isLocalChange.current ? 'Sync' : 'Saved'}</span>
            {isLocalChange.current && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />}
          </Button>

          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2 border-slate-300 text-slate-700 hover:bg-slate-50 h-11 md:h-10"
            onClick={loadFromCloud}
            disabled={isCloudLoading}
          >
            <RefreshCw className={cn("w-4 h-4", isCloudLoading && "animate-spin")} />
            <span className="hidden sm:inline">Load Cloud</span>
          </Button>

          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2 border-orange-500 text-orange-600 hover:bg-orange-50 h-11 md:h-10"
            onClick={() => setIsHistoryOpen(true)}
            disabled={editHistory.length === 0}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Undo / History</span>
            <span className="sm:hidden">Undo</span> ({editHistory.length})
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2 border-red-200 text-red-600 hover:bg-red-50 h-11 md:h-10"
            onClick={() => setIsClearConfirmOpen(true)}
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Clear Inputs</span>
            <span className="sm:hidden">Clear</span>
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2 border-green-800 text-green-800 hover:bg-green-50 h-11 md:h-10"
            onClick={() => setIsAddColumnOpen(true)}
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Create Column</span>
            <span className="sm:hidden">Column</span>
          </Button>
        </div>
      </div>

      <div className="bg-green-100/50 p-3 rounded-xl border border-green-200 shadow-sm flex flex-col lg:flex-row items-center gap-4">
        <div className="flex-1 w-full relative">
          <div className="flex items-center gap-2">
            <div className="bg-green-700 text-white p-2 rounded-lg shadow-inner">
              <Package className="w-5 h-5" />
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
              <Input 
                list="quick-entry-products"
                placeholder="Search/Select Product to add production or sales..." 
                className="pl-10 h-11 border-green-300 focus-visible:ring-green-500 bg-white"
                value={quickEntrySearch}
                onChange={(e) => {
                  setQuickEntrySearch(e.target.value);
                  const p = products.find(prod => prod.name === e.target.value);
                  if (p) setQuickEntryProductId(p.id);
                  else setQuickEntryProductId('');
                }}
              />
              <datalist id="quick-entry-products">
                {products.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="grid gap-1 flex-1">
            <Label className="text-[10px] font-bold text-green-800 uppercase tracking-tighter">Production</Label>
            <div className="relative">
              <PlusCircle className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-green-600" />
              <Input 
                type="text" 
                inputMode="decimal"
                className="pl-7 w-full lg:w-28 h-10 border-green-300 font-bold text-green-700" 
                placeholder="0"
                value={quickEntryProduction}
                onChange={e => setQuickEntryProduction(e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid gap-1 flex-1">
            <Label className="text-[10px] font-bold text-red-800 uppercase tracking-tighter">Qty Sold</Label>
            <div className="relative">
              <ShoppingCart className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-red-600" />
              <Input 
                type="text" 
                inputMode="decimal"
                className="pl-7 w-full lg:w-28 h-10 border-red-200 font-bold text-red-700" 
                placeholder="0"
                value={quickEntryQtySold}
                onChange={e => setQuickEntryQtySold(e.target.value)}
              />
            </div>
          </div>

          <Button 
            className="mt-5 lg:mt-5 bg-green-800 hover:bg-green-900 text-white shadow-md font-bold px-6 h-10"
            onClick={handleQuickEntryAdd}
          >
            Update
          </Button>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-green-800/20">
            <Table className="border-collapse min-w-[800px] md:min-w-full">
              <TableHeader>
                <TableRow className="bg-[#93c47d] hover:bg-[#93c47d] border-b-2 border-green-800">
                  <TableHead className="text-black font-bold text-center border-r border-green-800 min-w-[150px] sticky left-0 bg-[#93c47d] z-10">Product</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[80px]">New</TableHead>
                  {showDetailedStock && (
                    <TableHead className="text-black font-bold text-center border-r border-green-800 w-[100px]">Stock</TableHead>
                  )}
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[100px]">Unit</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[80px]">Prod.</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[80px]">Sold</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[100px]">Price</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[100px]">Rev.</TableHead>
                  <TableHead className="text-black font-bold text-center border-r border-green-800 w-[100px]">Status</TableHead>
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
                    <TableCell colSpan={7 + (showDetailedStock ? 1 : 0) + customColumns.length} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center gap-4">
                        <div className="bg-muted p-4 rounded-full">
                          <Package className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-semibold">No products found</p>
                          <p className="text-sm text-muted-foreground">Start by adding a product below or using Sample Data.</p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={async () => {
                            const toastId = toast.loading('Seeding sample products...');
                            try {
                              const sampleProducts = [
                                { name: 'Red Brick Standard', currentStock: 25000, minStockLevel: 5000, unit: 'pcs', category: 'Bricks', price: 12, availableStock: 25000, createdAt: Timestamp.now() },
                                { name: 'Red Brick Premium', currentStock: 15000, minStockLevel: 3000, unit: 'pcs', category: 'Bricks', price: 15, availableStock: 15000, createdAt: Timestamp.now() },
                                { name: 'Cement Bag', currentStock: 800, minStockLevel: 100, unit: 'bags', category: 'Construction', price: 1250, availableStock: 800, createdAt: Timestamp.now() }
                              ];
                              for (const p of sampleProducts) {
                                await addDoc(collection(db, 'products'), p);
                              }
                              toast.success('Sample products added', { id: toastId });
                            } catch (e: any) {
                              toast.error('Seeding failed: ' + e.message, { id: toastId });
                            }
                          }}
                        >
                          Add Sample Products
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const entry = entries[product.id] || { 
                      production: 0, 
                      qtySold: 0, 
                      price: product.price || 0, 
                      preparedStock: product.currentStock, 
                      unitType: 'piece' as 'ctn' | 'piece',
                      customFields: product.customFields || {} 
                    };
                    const newStock = entry.preparedStock - entry.qtySold;
                    const revenue = entry.qtySold * entry.price;
                    const isLowStock = newStock <= product.minStockLevel;
                    
                    return (
                      <TableRow key={product.id} className="hover:bg-accent/5 border-b border-green-800/30">
                        <TableCell className="font-bold text-left border-r border-green-800/30 p-1 sticky left-0 bg-background/80 backdrop-blur-sm z-10 min-w-[150px]">
                          <div className="flex items-center gap-2 px-2">
                            <div className="w-8 h-8 rounded shrink-0 overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-4 h-4 text-muted-foreground/40" />
                              )}
                            </div>
                            <Input 
                              className="w-full border-none bg-transparent focus-visible:ring-0 h-10 md:h-8 font-bold text-sm p-0"
                              value={product.name}
                              onChange={(e) => handleProductNameChange(product.id, e.target.value)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className={`text-center border-r border-green-800/30 font-bold text-sm ${newStock < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {newStock}
                        </TableCell>
                        {showDetailedStock && (
                          <TableCell className="text-center border-r border-green-800/30 p-1 bg-blue-50/30">
                            <Input 
                              type="text"
                              inputMode="decimal"
                              className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-10 md:h-8 font-bold text-blue-700"
                              value={entry.preparedStock}
                              onChange={(e) => handleEntryChange(product.id, 'preparedStock', e.target.value)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Select 
                            value={entry.unitType || 'piece'} 
                            onValueChange={(val: 'ctn' | 'piece') => handleEntryChange(product.id, 'unitType', val)}
                          >
                            <SelectTrigger className="h-8 border-none bg-transparent focus:ring-0 text-[10px] p-1 font-bold uppercase text-center justify-center">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="piece">PCS</SelectItem>
                              <SelectItem value="ctn">CTN</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="text"
                            inputMode="decimal"
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-10 md:h-8"
                            value={entry.production === 0 ? '' : entry.production}
                            onChange={(e) => handleEntryChange(product.id, 'production', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="text"
                            inputMode="decimal"
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-10 md:h-8"
                            value={entry.qtySold === 0 ? '' : entry.qtySold}
                            onChange={(e) => handleEntryChange(product.id, 'qtySold', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 p-1">
                          <Input 
                            type="text"
                            inputMode="decimal"
                            className="w-20 mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-10 md:h-8"
                            value={entry.price === 0 ? '' : entry.price}
                            onChange={(e) => handleEntryChange(product.id, 'price', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30 font-bold text-blue-600 text-sm">
                          Rs. {revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center border-r border-green-800/30">
                          {isLowStock ? (
                            <Badge variant="destructive" className="text-[10px] h-5 px-1">LOW</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1 bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>
                          )}
                        </TableCell>
                        {customColumns.map(column => (
                          <TableCell key={column} className="text-center border-r border-green-800/30 p-1">
                            <Input 
                              className="w-full mx-auto text-center border-none bg-transparent focus-visible:ring-0 h-10 md:h-8 text-sm"
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

                {/* Grand Total Row */}
                {products.length > 0 && (
                  <TableRow className="bg-green-800 text-white font-bold h-12">
                    <TableCell className="sticky left-0 bg-green-800 z-10 border-r border-white/20 text-right px-4 uppercase text-[10px] tracking-widest min-w-[150px]">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      {products.reduce((sum, p) => {
                        const entry = entries[p.id] || { preparedStock: p.currentStock, production: 0, qtySold: 0 };
                        return sum + ((entry.preparedStock || p.currentStock) + (entry.production || 0) - (entry.qtySold || 0));
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      {products.reduce((sum, p) => sum + (entries[p.id]?.preparedStock || p.currentStock || 0), 0)}
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      -
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      {products.reduce((sum, p) => sum + (entries[p.id]?.production || 0), 0)}
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      {products.reduce((sum, p) => sum + (entries[p.id]?.qtySold || 0), 0)}
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20">
                      -
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20 text-yellow-400">
                      Rs. {products.reduce((sum, p) => sum + ((entries[p.id]?.qtySold || 0) * (entries[p.id]?.price || 0)), 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center border-r border-white/20"></TableCell>
                    {customColumns.map(col => (
                      <TableCell key={col} className="border-r border-white/20"></TableCell>
                    ))}
                  </TableRow>
                )}

                {/* Quick Add Row */}
                <TableRow className="bg-accent/5 border-t-2 border-green-800/20">
                  <TableCell className="p-1 border-r border-green-800/30 sticky left-0 bg-background/80 backdrop-blur-sm z-10 min-w-[150px]">
                    <div className="flex gap-2 items-center px-2">
                      <Input 
                        placeholder="Quick add..." 
                        value={quickAddName}
                        onChange={e => setQuickAddName(e.target.value)}
                        className="h-9 md:h-8 text-sm border-dashed border-green-800/50"
                        onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                      />
                      <Button size="sm" variant="ghost" onClick={handleQuickAdd} className="h-9 md:h-8 px-2 text-green-700 hover:bg-green-100">
                        <PlusCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="border-r border-green-800/30 bg-accent/5" />
                  <TableCell colSpan={(showDetailedStock ? 1 : 0) + 6 + customColumns.length} className="bg-accent/5" />
                </TableRow>

                {/* Grand Total Row */}
                <TableRow className="bg-primary/10 font-bold border-t-2 border-green-800 h-14">
                  <TableCell className="text-right px-4 border-r border-green-800/30 sticky left-0 bg-primary/10 z-10 min-w-[150px]">
                    <span className="text-[10px] uppercase tracking-widest text-primary font-black">Grand Total</span>
                  </TableCell>
                  <TableCell className="border-r border-green-800/30 text-center text-primary">
                    {filteredProducts.reduce((sum, p) => {
                      const entry = entries[p.id] || { preparedStock: p.currentStock, production: 0, qtySold: 0 };
                      return sum + ((entry.preparedStock || p.currentStock) + (entry.production || 0) - (entry.qtySold || 0));
                    }, 0)}
                  </TableCell>
                  {showDetailedStock && <TableCell className="border-r border-green-800/30"></TableCell>}
                  <TableCell className="border-r border-green-800/30"></TableCell>
                  <TableCell className="text-center border-r border-green-800/30 text-primary">
                    {filteredProducts.reduce((sum, p) => sum + (entries[p.id]?.production || 0), 0)}
                  </TableCell>
                  <TableCell className="text-center border-r border-green-800/30 text-primary">
                    {filteredProducts.reduce((sum, p) => sum + (entries[p.id]?.qtySold || 0), 0)}
                  </TableCell>
                  <TableCell className="border-r border-green-800/30"></TableCell>
                  <TableCell className="text-center border-r border-green-800/30 text-primary text-base">
                    Rs. {filteredProducts.reduce((sum, p) => sum + ((entries[p.id]?.qtySold || 0) * (entries[p.id]?.price || 0)), 0).toLocaleString()}
                  </TableCell>
                  <TableCell colSpan={1 + customColumns.length}></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="p-4 md:p-6 bg-accent/5 flex flex-col items-center justify-center gap-2 border-t border-green-800/30">
            <p className="text-xs md:text-sm text-muted-foreground italic text-center">
              Use the "Save Data" button below to record your daily changes.
            </p>
            <p className="text-[10px] text-green-700 font-medium">
              Works offline - data will sync automatically when reconnected.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Floating Save Button for Mobile */}
      <div className="fixed bottom-6 right-6 z-50 md:hidden">
        <Button 
          className="rounded-full w-14 h-14 shadow-2xl bg-[#38761d] hover:bg-[#2d5e17] text-white p-0"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-6 h-6" />
          )}
        </Button>
      </div>

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

      {/* Clear Confirmation Dialog */}
      <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Clear All Inputs?
            </DialogTitle>
            <DialogDescription>
              This will reset all Production and Qty Sold numbers to zero. This action can be undone using the History button.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsClearConfirmOpen(false)} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleClearInputs} className="bg-red-600 hover:bg-red-700 flex-1 sm:flex-none">Clear Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit History / Undo Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Edit History
            </DialogTitle>
            <DialogDescription>
              Select a step to revert the sheet to that state.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-2 py-4">
            {editHistory.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground italic">No changes recorded yet.</p>
            ) : (
              editHistory.map((step, index) => (
                <div 
                  key={step.timestamp} 
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors group"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{step.description}</span>
                    <span className="text-xs text-muted-foreground">{format(step.timestamp, 'HH:mm:ss')}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => handleUndo(index)}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Undo to here
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
