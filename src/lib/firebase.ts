import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Try standard getFirestore first
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// CRITICAL: Validate connection to Firestore
async function testConnection() {
  try {
    if (typeof window !== 'undefined') {
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log("Firestore connection verified");
    }
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.message?.includes('Could not reach')) {
      console.warn("Firestore is operating in offline mode. Attempting recovery...");
    }
  }
}
testConnection();

export const auth = getAuth(app);
