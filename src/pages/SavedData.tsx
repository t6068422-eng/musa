import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit,
  onSnapshot, 
  doc, 
  deleteDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { safeToDate } from '@/lib/utils';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Download, 
  Trash2, 
  Eye, 
  Calendar as CalendarIcon,
  User as UserIcon,
  Clock,
  Image as ImageIcon,
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';

interface HistoryEntry {
  productId: string;
  productName: string;
  production: number;
  qtySold: number;
  price: number;
  unitType?: 'ctn' | 'piece';
  preparedStock: number;
  customFields: Record<string, any>;
  imageUrl?: string;
}

interface StockHistory {
  id: string;
  date: Timestamp;
  savedBy: string;
  savedByName: string;
  entries: HistoryEntry[];
  customColumns: string[];
}

export default function SavedData() {
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<StockHistory | null>(null);
  const { user, quotaExceeded } = useAuth();
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const detailRef = React.useRef<HTMLDivElement>(null);

  const downloadSummaryAsImage = () => {
    if (!summaryRef.current) return;
    toast.loading('Capturing saved data overview...');
    toPng(summaryRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `SavedData_Overview_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Overview captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  const downloadDetailAsImage = () => {
    if (!detailRef.current) return;
    toast.loading('Capturing detailed record...');
    toPng(detailRef.current, { backgroundColor: '#ffffff', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        const dateStr = selectedRecord ? format(safeToDate(selectedRecord.date), 'yyyy-MM-dd') : 'Record';
        link.download = `StockDetail_${dateStr}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Record captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'stockControlHistory'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockHistory));
      setHistory(data.sort((a, b) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateB - dateA;
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockControlHistory');
    });
    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string, savedBy: string) => {
    if (quotaExceeded) return toast.error('Cloud actions temporarily disabled due to daily quota limit.');
    if (!confirm('Are you sure you want to delete this record? This will also remove the data from all reports for this day.')) return;

    try {
      const batch = writeBatch(db);
      const dayId = id; // The ID of the record is the day yyyy-MM-dd
      
      // 1. Delete associated production entries for this day
      // StockControl saves production with ID: ${dayId}_${productId}
      const record = history.find(h => h.id === id);
      if (record) {
        record.entries.forEach(entry => {
          const prodRef = doc(db, 'production', `${dayId}_${entry.productId}`);
          const saleRef = doc(db, 'sales', `${dayId}_${entry.productId}`);
          batch.delete(prodRef);
          batch.delete(saleRef);
        });
      }

      // 2. Delete the history record itself
      batch.delete(doc(db, 'stockControlHistory', id));
      
      await batch.commit();
      toast.success('Record and associated report data deleted successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete record and associated data');
    }
  };

  const downloadCSV = (record: StockHistory) => {
    const recordDate = safeToDate(record.date);
    const dateStr = format(recordDate, 'yyyy-MM-dd');
    const timeStr = format(recordDate, 'HH-mm-ss');
    const dayStr = format(recordDate, 'EEEE');
    
    const customHeaders = record.customColumns.length > 0 ? `,${record.customColumns.join(',')}` : '';
    const header = `Product,Prepared Stock,Production,Qty Sold,Price,Revenue,New Prepared Stock${customHeaders}\n`;
    
    const rows = record.entries.map(e => {
      const newStock = e.preparedStock - e.qtySold;
      const revenue = e.qtySold * (e.price || 0);
      const customData = record.customColumns.map(c => `"${e.customFields[c] || ''}"`).join(',');
      const customDataStr = customData ? `,${customData}` : '';
      
      return `"${e.productName}",${e.preparedStock},${e.production},${e.qtySold},${e.price || 0},${revenue},${newStock}${customDataStr}`;
    }).join("\n");

    const content = `MUSA TRADERS - STOCK CONTROL SHEET (HISTORY)\nSaved By: ${record.savedByName}\nDate: ${dateStr}\nDay: ${dayStr}\nTime: ${timeStr}\n\n${header}${rows}`;
    
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Stock_History_${dateStr}_${timeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Stock Data</h1>
          <p className="text-muted-foreground">View and download historical stock control records. (Showing last 100 entries)</p>
        </div>
        <Button onClick={downloadSummaryAsImage} variant="outline" className="gap-2 self-start">
          <ImageIcon className="w-4 h-4" /> Download Overview (Picture)
        </Button>
      </div>

      <div ref={summaryRef} className="grid gap-6">
        {history.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-lg font-medium">No saved records found</p>
              <p className="text-sm text-muted-foreground">Records will appear here after you save data in the Stock Control Sheet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((record) => (
              <Card key={record.id} className="hover:shadow-md transition-shadow border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      {format(safeToDate(record.date), 'dd MMM yyyy')}
                    </CardTitle>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {record.entries?.length || 0} Items
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {format(safeToDate(record.date), 'hh:mm a')}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserIcon className="w-4 h-4" />
                      Saved by: <span className="text-foreground font-medium">{record.savedByName}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Dialog>
                      <DialogTrigger render={<Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => setSelectedRecord(record)} />}>
                        <Eye className="w-4 h-4" />
                        View
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            Stock Record - {format(safeToDate(record.date), 'dd MMM yyyy, hh:mm a')}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="mt-4">
                          <div className="mb-4 p-3 bg-accent/50 rounded-lg flex flex-wrap gap-2 justify-between items-center">
                            <div className="text-sm">
                              <span className="text-muted-foreground">Saved by:</span> <strong>{record.savedByName}</strong>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="gap-2" onClick={downloadDetailAsImage}>
                                <ImageIcon className="w-4 h-4" />
                                Download Picture
                              </Button>
                              <Button size="sm" className="gap-2" onClick={() => downloadCSV(record)}>
                                <Download className="w-4 h-4" />
                                Download CSV
                              </Button>
                            </div>
                          </div>
                          <div ref={detailRef} className="rounded-md border overflow-x-auto bg-white p-2">
                            <Table className="min-w-[800px]">
                              <TableHeader>
                                <TableRow className="bg-accent/50">
                                  <TableHead className="sticky left-0 bg-accent/50 z-10 w-[40px]"></TableHead>
                                  <TableHead className="sticky left-0 bg-accent/50 z-10">Product</TableHead>
                                  <TableHead className="text-center font-bold">Unit</TableHead>
                                  <TableHead className="text-center">Prepared</TableHead>
                                  <TableHead className="text-center">Production</TableHead>
                                  <TableHead className="text-center">Sold</TableHead>
                                  <TableHead className="text-center">Price</TableHead>
                                  <TableHead className="text-center">Revenue</TableHead>
                                  <TableHead className="text-center">New Stock</TableHead>
                                  {record.customColumns.map(col => (
                                    <TableHead key={col} className="text-center min-w-[100px]">{col}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {record.entries.map((entry, idx) => {
                                    if (!entry) return null;
                                    const prepared = entry.preparedStock || 0;
                                    const sold = entry.qtySold || 0;
                                    const price = entry.price || 0;
                                    return (
                                     <TableRow key={idx}>
                                       <TableCell className="sticky left-0 bg-background/80 backdrop-blur-sm z-10">
                                         <div className="w-8 h-8 rounded shrink-0 overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center">
                                           {entry.imageUrl ? (
                                             <img src={entry.imageUrl} alt={entry.productName} className="w-full h-full object-cover" />
                                           ) : (
                                             <Package className="w-4 h-4 text-muted-foreground/40" />
                                           )}
                                         </div>
                                       </TableCell>
                                       <TableCell className="font-medium sticky left-12 bg-background/80 backdrop-blur-sm z-10">{entry.productName}</TableCell>
                                       <TableCell className="text-center">
                                         <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                           {entry.unitType || 'piece'}
                                         </span>
                                       </TableCell>
                                       <TableCell className="text-center">{prepared}</TableCell>
                                       <TableCell className="text-center">{entry.production || 0}</TableCell>
                                       <TableCell className="text-center">{sold}</TableCell>
                                       <TableCell className="text-center">Rs. {price.toLocaleString()}</TableCell>
                                       <TableCell className="text-center font-bold text-blue-600">Rs. {(sold * price).toLocaleString()}</TableCell>
                                       <TableCell className="text-center font-bold">{prepared - sold}</TableCell>
                                       {record.customColumns.map(col => (
                                         <TableCell key={col} className="text-center">{(entry.customFields && entry.customFields[col]) || '-'}</TableCell>
                                       ))}
                                     </TableRow>
                                    );
                                   })}
                                   {record.entries.length > 0 && (
                                     <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                       <TableCell colSpan={2} className="text-right py-4 uppercase text-[10px] tracking-widest text-muted-foreground px-4">
                                         Grand Total
                                       </TableCell>
                                       <TableCell className="text-center">-</TableCell>
                                       <TableCell className="text-center text-primary font-black">
                                         {record.entries.reduce((sum, e) => sum + (e?.preparedStock || 0), 0)}
                                       </TableCell>
                                       <TableCell className="text-center text-primary font-black">
                                         {record.entries.reduce((sum, e) => sum + (e?.production || 0), 0)}
                                       </TableCell>
                                       <TableCell className="text-center text-primary font-black">
                                         {record.entries.reduce((sum, e) => sum + (e?.qtySold || 0), 0)}
                                       </TableCell>
                                       <TableCell className="text-center">-</TableCell>
                                       <TableCell className="text-center text-primary font-black text-base">
                                         Rs. {record.entries.reduce((sum, e) => sum + ((e?.qtySold || 0) * (e?.price || 0)), 0).toLocaleString()}
                                       </TableCell>
                                       <TableCell className="text-center font-black text-base">
                                         {record.entries.reduce((sum, e) => sum + ((e?.preparedStock || 0) - (e?.qtySold || 0)), 0)}
                                       </TableCell>
                                       {record.customColumns.map((col, i) => (
                                         <TableCell key={i}></TableCell>
                                       ))}
                                     </TableRow>
                                   )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => downloadCSV(record)}>
                      <Download className="w-4 h-4" />
                      CSV
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                      onClick={() => handleDelete(record.id, record.savedBy)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
