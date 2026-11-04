import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getDemoSession, resetDemo } from './api.demo';
import { isDemo, OfflineError } from './backend';
import { ensureProfile, getHousehold, membersOf } from './family';
import { auth, setCurrentHousehold } from './firebase';
import { clearOfflineData, onDataChanged, readSessionSnapshot, saveSessionSnapshot, setOffline } from './offlineCache';
import { forgetChanges } from './offlineQueue';
import { applyShoppingDay } from './selectedWeek';
import type { Household, Profile } from './types';

type SignedInSession = { user: { id: string; email: string | null } };

type SessionState = {
  loading: boolean;
  /** True when logged in, or always in demo mode. */
  signedIn: boolean;
  session: SignedInSession | null;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/** Fills in the settings a database without the latest SQL doesn't have yet. */
function withSettings(h: Partial<Household> & Pick<Household, 'id' | 'name' | 'invite_code'>): Household {
  const household: Household = {
    ...h,
    shopping_day: h.shopping_day ?? 0,
    chooser_rotation: h.chooser_rotation ?? [],
    rotation_start: h.rotation_start ?? null,
    avg_options: h.avg_options ?? [],
    remind_days_before: h.remind_days_before ?? 2,
    remind_hour: h.remind_hour ?? 9,
    shopper_ids: h.shopper_ids ?? [],
    aisle_overrides: h.aisle_overrides ?? {},
    aisle_setup: h.aisle_setup ?? {},
    staples: h.staples ?? [],
  };
  // Weeks start on the shopping day; set before any screen sees the household.
  applyShoppingDay(household.shopping_day);
  return household;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Demo mode has no login: its data is available immediately.
  const [demoStart] = useState(() => {
    if (!isDemo) return null;
    const demo = getDemoSession();
    return { ...demo, household: withSettings(demo.household) };
  });
  // Whoever was logged in on this device can start right away, with or without internet:
  // Firebase knows who that is from what's on the device.
  const [stored] = useState(() => {
    const snapshot = readSessionSnapshot();
    return snapshot && { ...snapshot, household: snapshot.household && withSettings(snapshot.household) };
  });
  const start = demoStart ?? stored;
  const [loading, setLoading] = useState(!isDemo);
  const [session, setSession] = useState<SignedInSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(start?.profile ?? null);
  const [household, setHousehold] = useState<Household | null>(start?.household ?? null);
  const [members, setMembers] = useState<Profile[]>(start?.members ?? []);

  const loadProfile = useCallback(async (user: User) => {
    try {
      const p = await ensureProfile(user.uid, user.displayName, user.email);
      const [h, m] = p.household_id
        ? await Promise.all([getHousehold(p.household_id), membersOf(p.household_id)])
        : [null, []];
      const full = h ? withSettings(h) : null;
      setCurrentHousehold(full?.id ?? null);
      setProfile(p);
      setHousehold(full);
      setMembers(m);
      saveSessionSnapshot({ profile: p, household: full, members: m });
      setOffline(false);
    } catch (e) {
      // Keep what we have, or you'd be sent to "Jouw gezin" whenever the internet drops.
      if (e instanceof OfflineError) setOffline(true);
    }
  }, []);

  const loadDemo = useCallback(() => {
    const demo = getDemoSession();
    setProfile(demo.profile);
    setHousehold(withSettings(demo.household));
    setMembers(demo.members);
  }, []);

  useEffect(() => {
    if (isDemo) return;
    // Also tells who's logged in at the start, from the device: this needs no internet.
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentHousehold(null);
        setSession(null);
        setProfile(null);
        setHousehold(null);
        setMembers([]);
        setLoading(false);
        return;
      }
      const known = readSessionSnapshot();
      if (known && known.profile.id !== user.uid) {
        // Someone else logged in on this device.
        clearOfflineData();
        forgetChanges();
      }
      const snapshot = known?.profile.id === user.uid ? known : null;
      const next = { user: { id: user.uid, email: user.email } };
      if (snapshot) {
        setCurrentHousehold(snapshot.household?.id ?? null);
        setProfile(snapshot.profile);
        setHousehold(snapshot.household && withSettings(snapshot.household));
        setMembers(snapshot.members);
        setSession(next);
        setLoading(false);
        await loadProfile(user);
      } else {
        // Load the profile before exposing the new session, so screens never see a session without its profile.
        await loadProfile(user);
        setSession(next);
        setLoading(false);
      }
    });
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (isDemo) return loadDemo();
    if (auth.currentUser) await loadProfile(auth.currentUser);
  }, [loadProfile, loadDemo]);

  // The internet is back: someone may have changed something.
  useEffect(() => {
    if (!isDemo) return onDataChanged(refresh);
  }, [refresh]);

  /** In demo mode this starts the demo over with the example data. */
  const signOut = useCallback(async () => {
    if (isDemo) {
      resetDemo();
      return loadDemo();
    }
    await firebaseSignOut(auth);
    clearOfflineData();
    forgetChanges();
  }, [loadDemo]);

  const signedIn = isDemo || !!session;

  return (
    <SessionContext.Provider value={{ loading, signedIn, session, profile, household, members, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
