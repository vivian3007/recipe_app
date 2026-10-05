import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Without Supabase settings (or with EXPO_PUBLIC_DEMO=1) the app runs in demo mode:
 * all data lives on the phone, with example recipes and an example family.
 */
export const isDemo = !supabaseUrl || !supabasePublishableKey || process.env.EXPO_PUBLIC_DEMO === '1';

// In demo mode the client is created with placeholders but never used.
export const supabase = createClient(supabaseUrl ?? 'http://localhost', supabasePublishableKey ?? 'demo', {
  auth: {
    storage: localStorage,
    autoRefreshToken: !isDemo,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web' && !isDemo) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
