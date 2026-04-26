import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { safeToDate } from '@/lib/utils';
import { ProductionEntry, SaleEntry, UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Factory, ShoppingCart, User as UserIcon, Calendar, ChevronDown, ChevronRight, Folder, DollarSign } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';

type Activity = (ProductionEntry | SaleEntry) & { type: 'production' | 'sale' };

export default function ActivityHistory() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
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
      query(collection(db, 'production'), limit(100)),
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
      query(collection(db, 'sales'), limit(100)),
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
    const combined = [...allProduction, ...allSales].sort((a, b) => {
      const dateA = a.date?.toMillis() || 0;
      const dateB = b.date?.toMillis() || 0;
      return dateB - dateA;
    }).slice(0, 200);
    setActivities(combined);
    
    // Auto-expand the first date
    if (combined.length > 0) {
      const firstDate = format(safeToDate(combined[0].date), 'yyyy-MM-dd');
      setExpandedDates(prev => ({ ...prev, [firstDate]: true }));
    }
  }, [allProduction, allSales]);

  const toggleDate = (dateKey: string) => {
    setExpandedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  // Group activities by date
  const groupedActivities = activities.reduce((acc, curr) => {
    if (!curr.date) return acc;
    const date = safeToDate(curr.date);
    // Use a stable date key to prevent timezone-based splitting
    const dateKey = format(date, 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(curr);
    return acc;
  }, {} as Record<string, Activity[]>);

  const sortedDateKeys = Object.keys(groupedActivities).sort((a, b) => b.localeCompare(a));

  const grandTotals = activities.reduce((acc, activity) => {
    acc.revenue += (activity.type === 'sale' ? (activity as any).total || 0 : 0);
    if (activity.type === 'sale') acc.sales += activity.quantity;
    if (activity.type === 'production') acc.production += activity.quantity;
    return acc;
  }, { revenue: 0, sales: 0, production: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Activity History</h2>
          <p className="text-muted-foreground">Detailed logs grouped by date folders.</p>
        </div>
        <Button onClick={downloadAsImage} variant="outline" className="gap-2">
          <ImageIcon className="w-4 h-4" /> Download Picture
        </Button>
      </div>

      <div ref={reportRef} className="space-y-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest">Total Sales Qty</p>
                  <p className="text-2xl font-black text-emerald-900 dark:text-emerald-50">{grandTotals.sales}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-emerald-500/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase tracking-widest">Total Production</p>
                  <p className="text-2xl font-black text-blue-900 dark:text-blue-50">{grandTotals.production}</p>
                </div>
                <Factory className="w-8 h-8 text-blue-500/20" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest">Grand Total Revenue</p>
                  <p className="text-2xl font-black text-amber-900 dark:text-amber-50">Rs. {grandTotals.revenue.toLocaleString()}</p>
                </div>
                <DollarSign className="w-8 h-8 text-amber-500/20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {sortedDateKeys.map((dateKey) => {
          const dateActivities = groupedActivities[dateKey];
          const isExpanded = expandedDates[dateKey];
          
          // Use the date from the first activity in the group to ensure local consistency
          const firstInGroup = dateActivities[0];
          const displayDate = format(safeToDate(firstInGroup.date), 'EEEE, MMMM dd, yyyy');

          return (
            <Card key={dateKey} className="overflow-hidden border-border/50 bg-card/30 backdrop-blur-sm">
              <div 
                onClick={() => toggleDate(dateKey)}
                className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-inner">
                    {isExpanded ? <Folder className="w-5 h-5 fill-current" /> : <Folder className="w-5 h-5" />}
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                       {displayDate}
                       {isExpanded && <Badge variant="secondary" className="text-[10px] h-4 px-1 border-primary/20">ACTIVE FOLDER</Badge>}
                    </h3>
                    <p className="text-xs text-muted-foreground">{dateActivities.length} logs in this folder</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {!isExpanded && (
                    <div className="hidden sm:flex items-center gap-3 text-xs">
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] uppercase text-muted-foreground">Qty</span>
                        <span className="font-bold text-primary">
                           {dateActivities.reduce((acc, a) => acc + (a.type === 'production' ? a.quantity : -a.quantity), 0)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] uppercase text-muted-foreground">Value</span>
                        <span className="font-bold text-primary">
                           Rs. {dateActivities.reduce((acc, a) => acc + (a.type === 'sale' ? (a as SaleEntry).total : 0), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="border-t bg-background/50">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="w-[100px]">Time</TableHead>
                            <TableHead className="w-[120px]">Type</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dateActivities.map((activity) => {
                            const isProduction = activity.type === 'production';
                            const userId = isProduction ? (activity as ProductionEntry).addedBy : (activity as SaleEntry).soldBy;
                            const userName = users[userId] || 'Unknown User';
                            
                            return (
                              <TableRow key={activity.id} className="hover:bg-accent/20 border-b border-border/10">
                                <TableCell className="text-xs text-muted-foreground tabular-nums">
                                  {format(safeToDate(activity.date), 'hh:mm a')}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isProduction ? "secondary" : "default"} className="gap-1 text-[9px] py-0 px-2 h-5">
                                    {isProduction ? <Factory className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                                    {isProduction ? 'PRODUCTION' : 'SALE'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {activity.unitType || 'PCS'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <UserIcon className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-sm truncate max-w-[120px]">{userName}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium truncate max-w-[150px]">{activity.productName}</TableCell>
                                <TableCell className={`text-right font-bold tabular-nums ${isProduction ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {isProduction ? '+' : '-'}{activity.quantity}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                  {isProduction ? '-' : `Rs. ${(activity as SaleEntry).total.toLocaleString()}`}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          
                          {/* Grand Total Row Section */}
                          <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20 h-16 pointer-events-none hover:bg-primary/5">
                            <TableCell colSpan={5} className="text-right">
                               <div className="flex flex-col items-end px-4">
                                 <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">FOLDER TOTALS</span>
                                 <span className="text-xs font-medium text-primary">
                                   Logs for {format(safeToDate(firstInGroup.date), 'MMMM dd, yyyy')}
                                 </span>
                               </div>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-muted-foreground uppercase font-bold">Qty Change</span>
                                <span className="text-primary text-lg font-black tabular-nums">
                                   {dateActivities.reduce((acc, a) => acc + (a.type === 'production' ? a.quantity : -a.quantity), 0)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-muted-foreground uppercase font-bold">Total Sales</span>
                                <span className="text-primary text-lg font-black tabular-nums">
                                   Rs. {dateActivities.reduce((acc, a) => acc + (a.type === 'sale' ? (a as SaleEntry).total : 0), 0).toLocaleString()}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}

        {sortedDateKeys.length === 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-xl border-2 border-dashed">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No recent activity recorded.</p>
          </div>
        )}
      </div>
    </div>
  );
}

