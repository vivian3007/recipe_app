import 'expo-sqlite/localStorage/install';
import type { FirebaseApp } from 'firebase/app';
// @ts-expect-error Only the React Native build of Firebase Auth has this, and its types aren't the ones TypeScript sees.
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';

// The login stays on the phone in the storage the app already has, so this needs no new native
// module (AsyncStorage would mean a new APK).
export const createAuth = (app: FirebaseApp): Auth =>
  initializeAuth(app, {
    persistence: getReactNativePersistence({
      getItem: async (key: string) => localStorage.getItem(key),
      setItem: async (key: string, value: string) => localStorage.setItem(key, value),
      removeItem: async (key: string) => localStorage.removeItem(key),
    }),
  });
