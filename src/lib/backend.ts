const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

/**
 * Without Firebase settings (or with EXPO_PUBLIC_DEMO=1) the app runs in demo mode:
 * all data lives on the phone, with example recipes and an example family.
 */
export const isDemo = !firebaseApiKey || !firebaseProjectId || process.env.EXPO_PUBLIC_DEMO === '1';

/** The request never reached the server. */
export class OfflineError extends Error {
  constructor() {
    super('Geen internet. Probeer het straks opnieuw.');
  }
}
