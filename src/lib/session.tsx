import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getDemoSession, resetDemo } from './api.demo';
import { clearOfflineData, onDataChanged, readSessionSnapshot, saveSessionSnapshot, setOffline } from './offlineCache';
import { forgetChanges } from './offlineQueue';
import { applyShoppingDay } from './selectedWeek';
import { isDemo, supabase } from './supabase';
import type { Household, Profile } from './types';

type SessionState = {
  loading: boolean;
  /** True when logged in, or always in demo mode. */
  signedIn: boolean;
  session: Session | null;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/** No answer from the server, which says nothing about whether someone has a family. */
const unreachable = (result: { status: number }) => result.status === 0 || result.status >= 500;

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
  // a session that has expired can't be renewed offline, but that doesn't log anyone out.
  const [stored] = useState(() => {
    const snapshot = readSessionSnapshot();
    return snapshot && { ...snapshot, household: snapshot.household && withSettings(snapshot.household) };
  });
  const start = demoStart ?? stored;
  const [knownUser, setKnownUser] = useState(!!stored);
  const [loading, setLoading] = useState(!isDemo && !stored);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(start?.profile ?? null);
  const [household, setHousehold] = useState<Household | null>(start?.household ?? null);
  const [members, setMembers] = useState<Profile[]>(start?.members ?? []);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      clearOfflineData();
      forgetChanges();
      setKnownUser(false);
      setProfile(null);
      setHousehold(null);
      setMembers([]);
      return;
    }
    const profileResult = await supabase
      .from('profiles')
      .select('id, display_name, household_id')
      .eq('id', s.user.id)
      .maybeSingle();
    // Keep what we have, or you'd be sent to "Jouw gezin" whenever the internet drops.
    if (unreachable(profileResult)) {
      if (profileResult.status === 0) setOffline(true);
      return;
    }
    const p = profileResult.data;

    if (p?.household_id) {
      const [householdResult, membersResult] = await Promise.all([
        // All columns, so the app keeps working before the SQL for newer settings has been run.
        supabase.from('households').select('*').eq('id', p.household_id).single(),
        supabase
          .from('profiles')
          .select('id, display_name, household_id')
          .eq('household_id', p.household_id)
          .order('display_name'),
      ]);
      if (unreachable(householdResult) || unreachable(membersResult)) {
        if (householdResult.status === 0 || membersResult.status === 0) setOffline(true);
        return;
      }
      const h = householdResult.data ? withSettings(householdResult.data) : null;
      const m = membersResult.data ?? [];
      setProfile(p);
      setHousehold(h);
      setMembers(m);
      saveSessionSnapshot({ profile: p, household: h, members: m });
    } else {
      setProfile(p ?? null);
      setHousehold(null);
      setMembers([]);
      if (p) saveSessionSnapshot({ profile: p, household: null, members: [] });
    }
    setOffline(false);
  }, []);

  const loadDemo = useCallback(() => {
    const demo = getDemoSession();
    setProfile(demo.profile);
    setHousehold(withSettings(demo.household));
    setMembers(demo.members);
  }, []);

  useEffect(() => {
    if (isDemo) return;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!data.session && isAuthRetryableFetchError(error)) setOffline(true);
      else {
        setSession(data.session);
        await loadProfile(data.session);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Load the profile before exposing the new session, so screens never see a
        // session without its profile. Deferred out of the auth callback to avoid deadlocks.
        setTimeout(async () => {
          await loadProfile(s);
          setSession(s);
        }, 0);
      } else if (s) {
        setSession(s);
      }
      // No session at the start just means it couldn't be renewed yet; getSession above decides.
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (isDemo) return loadDemo();
    const { data, error } = await supabase.auth.getSession();
    if (!data.session && isAuthRetryableFetchError(error)) return setOffline(true);
    if (data.session) setSession((current) => current ?? data.session);
    await loadProfile(data.session);
  }, [loadProfile, loadDemo]);

  // The internet is back: the session can be renewed, and someone may have changed something.
  useEffect(() => {
    if (!isDemo) return onDataChanged(refresh);
  }, [refresh]);

  /** In demo mode this starts the demo over with the example data. */
  const signOut = useCallback(async () => {
    if (isDemo) {
      resetDemo();
      return loadDemo();
    }
    await supabase.auth.signOut();
  }, [loadDemo]);

  const signedIn = isDemo || !!session || knownUser;

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
