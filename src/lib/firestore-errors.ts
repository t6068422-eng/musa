import { auth } from './firebase';

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
    // Broadcast globally so the UI can respond
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    }
    
    // Log once only for the session to prevent flooding the console
    if (!(window as any).__quota_warned) {
      console.warn(`[Quota Limit Reach]: Firestore free tier limit exceeded. Writes are temporarily disabled.`);
      (window as any).__quota_warned = true;
    }
    
    // Don't throw for quota errors, just allow the app to be silent
    return;
  }

  // Detect network issues
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const isNetworkError = 
    errorMsg.includes('backend didn\'t respond') ||
    errorMsg.includes('could not reach cloud firestore') ||
    (error as any)?.code === 'unavailable' ||
    (error as any)?.code === 'deadline-exceeded';

  if (isNetworkError) {
    if (!(window as any).__network_warned) {
      console.warn(`[Firestore Offline]: Network issues detected. The client will operate in offline mode.`);
      (window as any).__network_warned = true;
    }
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
