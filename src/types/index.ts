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
  price?: number;
  imageUrl?: string;
  customFields?: Record<string, any>;
  createdAt: Timestamp;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  branchName?: string;
  creditBalance?: number;
  createdAt: Timestamp;
  lastPurchaseDate?: Timestamp;
  totalSpent?: number;
  totalQuantity?: number;
}

export interface BuiltyItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  unitType?: 'ctn' | 'piece';
}

export interface Builty {
  id: string;
  builtyNumber: string;
  senderName: string;
  receiverName: string;
  destination: string;
  transportName: string;
  totalItems: number;
  weight?: string;
  unitPrice?: number;
  freightAmount: number;
  status: 'pending' | 'in-transit' | 'delivered' | 'cancelled';
  date: Timestamp;
  createdAt: Timestamp;
  notes?: string;
  items?: BuiltyItem[];
}

export interface AppSettings {
  customColumns: string[];
}

export interface StockEntry {
  productId: string;
  production: number;
  qtySold: number;
  price: number;
  unitType?: 'ctn' | 'piece';
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
  unitType?: 'ctn' | 'piece';
  date: Timestamp;
  addedBy: string;
}

export interface SaleEntry {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitType?: 'ctn' | 'piece';
  price: number;
  total: number;
  date: Timestamp;
  soldBy: string;
  clientId?: string;
  clientName?: string;
}

export interface MonthlyDetailedEntry {
  productId: string;
  productName: string;
  production: number;
  qtySold: number;
  revenue: number;
  preparedStock: number;
  currentStock: number;
  price: number;
  imageUrl?: string;
}

export interface MonthlyReport {
  month: string;
  lastUpdated: Timestamp;
  totalRevenue: number;
  totalProduction: number;
  totalSalesQty: number;
  saveCount: number;
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
