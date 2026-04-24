import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { safeToDate } from '@/lib/utils';
import { ProductionEntry, SaleEntry, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Factory, ShoppingCart, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Activity = (ProductionEntry | SaleEntry) & { type: 'production' | 'sale' };

export default function ActivityHistory() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const reportRef = React.useRef<HTMLDivElement>(null);

  const downloadAsImage = () => {
    if (!reportRef.current) return;
    
    toast.loading('Capturing activity history...');
    toPng(reportRef.current, { backgroundColor: '#f8fafc', cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `ActivityHistory_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        toast.dismiss();
        toast.success('Activity history captured');
      })
      .catch((err) => {
        console.error(err);
        toast.dismiss();
        toast.error('Failed to capture image');
      });
  };

  useEffect(() => {
    if (!user) return;
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userMap: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as UserProfile;
        userMap[doc.id] = data.name;
      });
      setUsers(userMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubscribeProduction = onSnapshot(
      query(collection(db, 'production'), orderBy('date', 'desc'), limit(50)),
      (snapshot) => {
        const production = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          type: 'production' as const 
        } as Activity));
        updateActivities(production, 'production');
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'production');
      }
    );

    const unsubscribeSales = onSnapshot(
      query(collection(db, 'sales'), orderBy('date', 'desc'), limit(50)),
      (snapshot) => {
        const sales = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          type: 'sale' as const 
        } as Activity));
        updateActivities(sales, 'sale');
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sales');
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeProduction();
      unsubscribeSales();
    };
  }, [user]);

  const [allProduction, setAllProduction] = useState<Activity[]>([]);
  const [allSales, setAllSales] = useState<Activity[]>([]);

  const updateActivities = (newData: Activity[], type: 'production' | 'sale') => {
    if (type === 'production') setAllProduction(newData);
    else setAllSales(newData);
  };

  useEffect(() => {
    const combined = [...allProduction, ...allSales].sort((a, b) => 
      b.date.toMillis() - a.date.toMillis()
    ).slice(0, 100);
    setActivities(combined);
  }, [allProduction, allSales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Activity History</h2>
          <p className="text-muted-foreground">Track who added what and when.</p>
        </div>
        <Button onClick={downloadAsImage} variant="outline" className="gap-2">
          <ImageIcon className="w-4 h-4" /> Download Picture
        </Button>
      </div>

      <div ref={reportRef} className="space-y-6">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <div className="overflow-hidden border rounded-lg">
            <div className="overflow-x-auto scrollbar-custom">
              <div className="max-h-[500px] overflow-y-auto scrollbar-custom">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-20 shadow-md border-b">
                    <TableRow>
                      <TableHead className="min-w-[120px] bg-background font-bold text-foreground">Time</TableHead>
                      <TableHead className="min-w-[100px] bg-background font-bold text-foreground">Type</TableHead>
                      <TableHead className="min-w-[120px] bg-background font-bold text-foreground">User</TableHead>
                      <TableHead className="min-w-[150px] bg-background font-bold text-foreground">Product</TableHead>
                      <TableHead className="text-right bg-background font-bold text-foreground">Quantity</TableHead>
                      <TableHead className="text-right bg-background font-bold text-foreground">Details</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {activities.map((activity) => {
                  const isProduction = activity.type === 'production';
                  const userId = isProduction ? (activity as ProductionEntry).addedBy : (activity as SaleEntry).soldBy;
                  const userName = users[userId] || 'Unknown User';
                  
                  return (
                    <TableRow key={activity.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(safeToDate(activity.date), 'MMM dd, HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isProduction ? "secondary" : "outline"} className="gap-1 text-[10px]">
                          {isProduction ? <Factory className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                          {isProduction ? 'Production' : 'Sale'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{userName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{activity.productName}</TableCell>
                      <TableCell className="text-right font-bold">
                        {isProduction ? '+' : '-'}{activity.quantity}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {!isProduction && `Rs. ${(activity as SaleEntry).total.toLocaleString()}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </CardContent>
      </Card>
    </div>
  </div>
);
}
