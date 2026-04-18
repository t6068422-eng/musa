import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
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
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
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
  preparedStock: number;
  customFields: Record<string, any>;
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
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'stockControlHistory'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockHistory)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stockControlHistory');
    });
    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string, savedBy: string) => {
    if (!isAdmin && user?.uid !== savedBy) {
      toast.error('You can only delete your own records');
      return;
    }

    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
      await deleteDoc(doc(db, 'stockControlHistory', id));
      toast.success('Record deleted successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete record');
    }
  };

  const downloadCSV = (record: StockHistory) => {
    const dateStr = format(record.date.toDate(), 'yyyy-MM-dd');
    const timeStr = format(record.date.toDate(), 'HH-mm-ss');
    const dayStr = format(record.date.toDate(), 'EEEE');
    
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
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Saved Stock Data</h1>
        <p className="text-muted-foreground">View and download historical stock control records.</p>
      </div>

      <div className="grid gap-6">
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
                      {format(record.date.toDate(), 'dd MMM yyyy')}
                    </CardTitle>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {record.entries.length} Items
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {format(record.date.toDate(), 'hh:mm a')}
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
                            Stock Record - {format(record.date.toDate(), 'dd MMM yyyy, hh:mm a')}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="mt-4">
                          <div className="mb-4 p-3 bg-accent/50 rounded-lg flex justify-between items-center">
                            <div className="text-sm">
                              <span className="text-muted-foreground">Saved by:</span> <strong>{record.savedByName}</strong>
                            </div>
                            <Button size="sm" className="gap-2" onClick={() => downloadCSV(record)}>
                              <Download className="w-4 h-4" />
                              Download CSV
                            </Button>
                          </div>
                          <div className="rounded-md border overflow-x-auto">
                            <Table className="min-w-[800px]">
                              <TableHeader>
                                <TableRow className="bg-accent/50">
                                  <TableHead className="sticky left-0 bg-accent/50 z-10">Product</TableHead>
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
                                  {record.entries.map((entry, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium sticky left-0 bg-background/80 backdrop-blur-sm z-10">{entry.productName}</TableCell>
                                      <TableCell className="text-center">{entry.preparedStock}</TableCell>
                                      <TableCell className="text-center">{entry.production}</TableCell>
                                      <TableCell className="text-center">{entry.qtySold}</TableCell>
                                      <TableCell className="text-center">Rs. {(entry.price || 0).toLocaleString()}</TableCell>
                                      <TableCell className="text-center font-bold text-blue-600">Rs. {(entry.qtySold * (entry.price || 0)).toLocaleString()}</TableCell>
                                      <TableCell className="text-center font-bold">{entry.preparedStock - entry.qtySold}</TableCell>
                                      {record.customColumns.map(col => (
                                        <TableCell key={col} className="text-center">{entry.customFields[col] || '-'}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
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
                    
                    {(isAdmin || user?.uid === record.savedBy) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                        onClick={() => handleDelete(record.id, record.savedBy)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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
