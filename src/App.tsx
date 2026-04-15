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

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/production" element={<Production />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/stock-control" element={<StockControl />} />
              <Route path="/saved-data" element={<SavedData />} />
              <Route path="/prepared-stock" element={<PreparedStock />} />
              <Route path="/available-stock" element={<AvailableStock />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/history" element={<ActivityHistory />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
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
          <Toaster position="top-right" />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
