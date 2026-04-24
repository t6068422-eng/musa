import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, disableNetwork, enableNetwork } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  quotaExceeded: boolean;
  isOffline: boolean;
  setQuotaExceeded: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  quotaExceeded: false,
  isOffline: false,
  setQuotaExceeded: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setLoading(false);
      } else {
        // Provide a guest user to bypass login checks if user doesn't want auth
        setUser({ 
          uid: 'guest_user', 
          email: 'guest@musatraders.local',
          displayName: 'Musa Traders Admin',
          emailVerified: true
        } as User);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const handler = () => {
      setQuotaExceeded(true);
      // Stop all network traffic immediately to stop retry loops and console flood
      disableNetwork(db).catch(err => console.warn('Failed to disable network:', err.message));
    };
    window.addEventListener('firestore-quota-exceeded', handler);
    return () => window.removeEventListener('firestore-quota-exceeded', handler);
  }, []);

  // When manually resetting quota (e.g. at start of day) or when app starts
  useEffect(() => {
    if (!quotaExceeded) {
      enableNetwork(db).catch(err => console.warn('Failed to enable network:', err.message));
    }
  }, [quotaExceeded]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile: null, loading, quotaExceeded, isOffline, setQuotaExceeded }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
