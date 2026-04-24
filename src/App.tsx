import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Production from './pages/Production';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import PreparedStock from './pages/PreparedStock';
import AvailableStock from './pages/AvailableStock';
import ActivityHistory from './pages/ActivityHistory';
import StockControl from './pages/StockControl';
import SavedData from './pages/SavedData';
import MonthlyReport from './pages/MonthlyReport';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Builties from './pages/Builties';
import BuiltyDetail from './pages/BuiltyDetail';
import Login from './pages/Login';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/production" element={<Production />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/stock-control" element={<StockControl />} />
                <Route path="/saved-data" element={<SavedData />} />
                <Route path="/monthly-report" element={<MonthlyReport />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:clientId" element={<ClientDetail />} />
                <Route path="/builties" element={<Builties />} />
                <Route path="/builties/:builtyId" element={<BuiltyDetail />} />
                <Route path="/prepared-stock" element={<PreparedStock />} />
                <Route path="/available-stock" element={<AvailableStock />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/history" element={<ActivityHistory />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
          <Toaster position="top-center" />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
