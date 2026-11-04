import { FirebaseError, initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  runTransaction,
  type DocumentReference,
  type Query,
  type Transaction,
} from 'firebase/firestore';

import { OfflineError } from './backend';
import { createAuth } from './firebaseAuth';

// In demo mode these are created with placeholders but never used.
const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'demo',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-weekmenu',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

export const auth = createAuth(app);
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

// For testing against the local emulators.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

// The family of whoever is logged in: every family's data is stored under the family.
let household: string | null = null;

export const currentHousehold = () => household;

export function setCurrentHousehold(id: string | null) {
  household = id;
}

// What Firebase says when it can't reach the server. A transaction that keeps failing to reach
// it ends as "cancelled".
const NO_CONNECTION = new Set(['unavailable', 'cancelled', 'deadline-exceeded', 'auth/network-request-failed']);

function translated(e: unknown): unknown {
  return e instanceof FirebaseError && NO_CONNECTION.has(e.code) ? new OfflineError() : e;
}

export async function offlineAware<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (e) {
    throw translated(e);
  }
}

// Always from the server: reading from Firebase's cache without internet can give an empty result
// that looks real, and would then replace the list kept on the device.
export const readDoc = (ref: DocumentReference) => offlineAware(() => getDocFromServer(ref));
export const readDocs = (query: Query) => offlineAware(() => getDocsFromServer(query));

/**
 * Every write goes through a transaction. A plain write waits for the internet without ever
 * failing, invisibly next to the app's own queue (offlineQueue.ts); a transaction fails after a few seconds.
 */
export const write = <T>(changes: (tx: Transaction) => Promise<T>) =>
  offlineAware(() => runTransaction(db, changes));

/** Whether anything comes through: asking for your own profile always is allowed. */
export async function profileIsReachable() {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    await readDoc(doc(db, 'profiles', uid));
    return true;
  } catch (e) {
    return !(e instanceof OfflineError);
  }
}
