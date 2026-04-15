import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Static default user for the entire application
  const defaultUser = {
    uid: 'default-admin',
    email: 'admin@musatraders.com',
    displayName: 'Musa Admin',
  } as any;

  const defaultProfile: UserProfile = {
    uid: 'default-admin',
    email: 'admin@musatraders.com',
    name: 'Musa Admin',
    role: 'admin',
  };

  const [user] = useState<User | null>(defaultUser);
  const [profile] = useState<UserProfile | null>(defaultProfile);
  const [loading] = useState(false);

  const isAdmin = true;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
