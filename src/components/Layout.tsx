import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Factory, 
  ShoppingCart, 
  BarChart3, 
  Menu, 
  X,
  LogOut,
  User as UserIcon,
  Users,
  Truck,
  Activity,
  History,
  FileText,
  FileBarChart,
  AlertCircle,
  WifiOff
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Stock Control', path: '/stock-control', icon: FileText },
  { name: 'Detailed Reports', path: '/monthly-report', icon: FileBarChart },
  { name: 'Saved Data', path: '/saved-data', icon: History },
  { name: 'Products', path: '/products', icon: Package },
  { name: 'Clients', path: '/clients', icon: Users },
  { name: 'Builties', path: '/builties', icon: Truck },
  { name: 'Production', path: '/production', icon: Factory },
  { name: 'Sales', path: '/sales', icon: ShoppingCart },
  { name: 'Prepared Stock', path: '/prepared-stock', icon: Activity },
  { name: 'Available Stock', path: '/available-stock', icon: Package },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
  { name: 'History', path: '/history', icon: History },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { quotaExceeded, setQuotaExceeded, isOffline } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/50 backdrop-blur-sm sticky top-0 h-screen">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
              M
            </div>
            MUSA TRADERS
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "" : "group-hover:scale-110 transition-transform")} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => auth.signOut()}
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-sm font-bold">
              M
            </div>
            <h1 className="text-lg font-bold tracking-tighter">MUSA TRADERS</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="h-10 w-10">
            <Menu className="w-6 h-6" />
          </Button>
        </header>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] md:hidden"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-72 bg-card border-r border-border z-[70] md:hidden flex flex-col"
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <h1 className="text-xl font-bold tracking-tighter">MUSA TRADERS</h1>
                  <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                    <X className="w-6 h-6" />
                  </Button>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                          isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>
                <div className="p-4 border-t border-border">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => auth.signOut()}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </Button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {isOffline && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 flex items-center gap-3 shadow-sm rounded-r-lg no-print">
              <WifiOff className="text-amber-500 h-5 w-5" />
              <div>
                <p className="text-sm font-bold text-amber-800">You are currently offline</p>
                <p className="text-xs text-amber-700">Changes will be saved locally and synced once your connection returns.</p>
              </div>
            </div>
          )}
          {quotaExceeded && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 flex items-center justify-between shadow-sm rounded-r-lg animate-in fade-in slide-in-from-top-2 no-print">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-red-500 h-5 w-5" />
                <div>
                  <p className="text-sm font-bold text-red-800">Cloud Sync Warning: Daily Limit Reached</p>
                  <p className="text-xs text-red-700">Firestore free tier limit reached. New changes are saved in this browser but won't sync to others until tomorrow.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setQuotaExceeded(false)} className="text-red-500">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
