import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getDemoSession, resetDemo } from './api.demo';
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

export function SessionProvider({ children }: { children: ReactNode }) {
  // Demo mode has no login: its data is available immediately.
  const [demoStart] = useState(() => (isDemo ? getDemoSession() : null));
  const [loading, setLoading] = useState(!isDemo);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(demoStart?.profile ?? null);
  const [household, setHousehold] = useState<Household | null>(demoStart?.household ?? null);
  const [members, setMembers] = useState<Profile[]>(demoStart?.members ?? []);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setHousehold(null);
      setMembers([]);
      return;
    }
    const { data: p } = await supabase
      .from('profiles')
      .select('id, display_name, household_id')
      .eq('id', s.user.id)
      .maybeSingle();
    setProfile(p ?? null);

    if (p?.household_id) {
      const [{ data: h }, { data: m }] = await Promise.all([
        supabase.from('households').select('id, name, invite_code').eq('id', p.household_id).single(),
        supabase
          .from('profiles')
          .select('id, display_name, household_id')
          .eq('household_id', p.household_id)
          .order('display_name'),
      ]);
      setHousehold(h ?? null);
      setMembers(m ?? []);
    } else {
      setHousehold(null);
      setMembers([]);
    }
  }, []);

  const loadDemo = useCallback(() => {
    const demo = getDemoSession();
    setProfile(demo.profile);
    setHousehold(demo.household);
    setMembers(demo.members);
  }, []);

  useEffect(() => {
    if (isDemo) return;

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
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
      } else {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (isDemo) return loadDemo();
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile, loadDemo]);

  /** In demo mode this starts the demo over with the example data. */
  const signOut = useCallback(async () => {
    if (isDemo) {
      resetDemo();
      return loadDemo();
    }
    await supabase.auth.signOut();
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
