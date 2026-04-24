import { auth } from './firebase';
import { toast } from 'sonner';

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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const isQuotaError = (error instanceof Error && error.message.includes('Quota exceeded')) || 
                       (error as any)?.code === 'resource-exhausted' ||
                       (error as any)?.code === '7'; // gRPC code for resource exhausted
  
  const errorMessage = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }

  // If it's a quota error, log a cleaner warning to avoid flooding
  if (isQuotaError) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    }
    
    if (!(window as any).__quota_warned) {
      console.warn(`[Quota Limit Reach]: Firestore free tier limit exceeded.`);
      (window as any).__quota_warned = true;
    }
    return;
  }

  // Detect network issues
  const errorMsgLower = errorMessage.toLowerCase();
  const isNetworkError = 
    errorMsgLower.includes('backend didn\'t respond') ||
    errorMsgLower.includes('could not reach cloud firestore') ||
    (error as any)?.code === 'unavailable' ||
    (error as any)?.code === 'deadline-exceeded';

  if (isNetworkError) {
    if (!(window as any).__network_warned) {
      console.warn(`[Firestore Offline]: Network issues detected.`);
      (window as any).__network_warned = true;
    }
    return;
  }

  console.error('Firestore Error:', errInfo);
  
  // Show toast for user awareness instead of crashing
  if (operationType === OperationType.LIST || operationType === OperationType.GET) {
    toast.error(`Error loading ${path || 'data'}: ${errorMessage}`);
  } else {
    toast.error(`Error performing ${operationType} on ${path || 'data'}: ${errorMessage}`);
  }

  // Do NOT throw to avoid crashing the whole component tree
}
