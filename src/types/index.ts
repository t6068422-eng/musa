import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  minStockLevel: number;
  currentStock: number;
  availableStock: number;
  customFields?: Record<string, any>;
  createdAt: Timestamp;
}

export interface AppSettings {
  customColumns: string[];
}

export interface StockEntry {
  productId: string;
  production: number;
  qtySold: number;
  price: number;
  preparedStock: number;
  customFields: Record<string, any>;
}

export interface StockHistory {
  id: string;
  date: Timestamp;
  savedBy: string;
  savedByName: string;
  entries: StockEntry[];
  customColumns: string[];
}

export interface ProductionEntry {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  date: Timestamp;
  addedBy: string;
}

export interface SaleEntry {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  date: Timestamp;
  soldBy: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
