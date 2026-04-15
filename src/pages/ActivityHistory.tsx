import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { ProductionEntry, SaleEntry, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Factory, ShoppingCart, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

type Activity = (ProductionEntry | SaleEntry) & { type: 'production' | 'sale' };

export default function ActivityHistory() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const { user } = useAuth();

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
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Activity History</h2>
        <p className="text-muted-foreground">Track who added what and when.</p>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Details</TableHead>
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
                      {format(activity.date.toDate(), 'MMM dd, HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isProduction ? "secondary" : "outline"} className="gap-1">
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
                      {!isProduction && `$${(activity as SaleEntry).total.toLocaleString()}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
