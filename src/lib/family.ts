import { FirebaseError } from 'firebase/app';
import { collection, doc, query, where } from 'firebase/firestore';

import { auth, db, readDoc, readDocs, write } from './firebase';
import type { Household, Profile } from './types';

// Logging in and joining a family. The demo has a family from the start, so unlike api.firebase.ts
// these have no demo version.

const profileRef = (id: string) => doc(db, 'profiles', id);

export async function membersOf(householdId: string): Promise<Profile[]> {
  const snapshot = await readDocs(query(collection(db, 'profiles'), where('household_id', '==', householdId)));
  return snapshot.docs
    .map((d) => ({ ...d.data(), id: d.id }) as Profile)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** Makes the profile when someone is new: with their name, or else the first part of their e-mail address. */
export async function ensureProfile(id: string, name: string | null, email: string | null): Promise<Profile> {
  const existing = await readDoc(profileRef(id));
  if (existing.exists()) return { ...existing.data(), id } as Profile;
  const profile = {
    display_name: name?.trim() || email?.split('@')[0] || 'Gezinslid',
    household_id: null,
    created_at: new Date().toISOString(),
  };
  await write(async (tx) => {
    tx.set(profileRef(id), profile);
  });
  return { id, display_name: profile.display_name, household_id: null };
}

export async function getHousehold(id: string) {
  const snapshot = await readDoc(doc(db, 'households', id));
  return snapshot.exists() ? ({ ...snapshot.data(), id } as Household) : null;
}

/** Six letters and digits, like the codes made so far. */
const randomCode = () => Array.from({ length: 6 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');

export async function createHousehold(name: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Niet ingelogd');
  const household = doc(collection(db, 'households'));
  await write(async (tx) => {
    const code = randomCode();
    const invite = doc(db, 'inviteCodes', code);
    if ((await tx.get(invite)).exists()) throw new Error('Dat lukte net niet, probeer het nog eens.');
    tx.set(household, {
      name,
      invite_code: code,
      created_by: uid,
      shopping_day: 0,
      chooser_rotation: [],
      rotation_start: null,
      avg_options: [],
      aisle_overrides: {},
      aisle_setup: {},
      staples: [],
      remind_days_before: 2,
      remind_hour: 9,
      shopper_ids: [],
      created_at: new Date().toISOString(),
    });
    tx.set(invite, { household_id: household.id });
    tx.update(profileRef(uid), { household_id: household.id });
  });
}

export async function joinHousehold(enteredCode: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Niet ingelogd');
  const code = enteredCode.trim().toUpperCase();
  if (!code) throw new Error('Onbekende gezinscode');
  await write(async (tx) => {
    const invite = await tx.get(doc(db, 'inviteCodes', code));
    if (!invite.exists()) throw new Error('Onbekende gezinscode');
    tx.update(profileRef(uid), { household_id: invite.data().household_id, joined_with: code });
  });
}

/** What Firebase Auth's errors mean, in the words of the app. */
export function loginErrorText(e: unknown) {
  switch (e instanceof FirebaseError ? e.code : '') {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail of wachtwoord klopt niet.';
    case 'auth/invalid-email':
      return 'Dat e-mailadres klopt niet.';
    case 'auth/email-already-in-use':
      return 'Er is al een account met dit e-mailadres.';
    case 'auth/weak-password':
      return 'Je wachtwoord moet minstens 6 tekens zijn.';
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het straks opnieuw.';
    case 'auth/network-request-failed':
      return 'Geen internet. Probeer het straks opnieuw.';
    default:
      return (e as Error).message;
  }
}
