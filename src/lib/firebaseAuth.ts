import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// On the web Firebase remembers the login in the browser itself.
// The Android app uses firebaseAuth.native.ts.
export const createAuth = (app: FirebaseApp) => getAuth(app);
