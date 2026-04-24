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
  isAdmin: boolean;
  quotaExceeded: boolean;
  isOffline: boolean;
  setQuotaExceeded: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  quotaExceeded: false,
  isOffline: false,
  setQuotaExceeded: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch user profile from Firestore
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setProfile({ uid: snapshot.id, ...snapshot.data() } as UserProfile);
      } else {
        // Fallback for new users or if profile doc is missing
        setProfile({
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || user.email?.split('@')[0] || 'User',
          role: 'staff' // Default role
        });
      }
      setLoading(false);
    }, (error) => {
      console.warn('Profile fetch error:', error.message);
      setLoading(false);
    });

    return () => unsubscribeProfile();
  }, [user]);

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

  const isAdmin = !!user;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, quotaExceeded, isOffline, setQuotaExceeded }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
