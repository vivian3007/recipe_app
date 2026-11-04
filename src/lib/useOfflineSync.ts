import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { addWeeks, weekStartOf } from './dates';
import { isOffline, setOffline } from './offlineCache';
import { checkConnection, flushChanges, keepWeekOnDevice } from './offlineQueue';
import { useSession } from './session';
import { isDemo } from './backend';

const RETRY_MS = 20_000;

/**
 * Keeps this device ready for no internet: sends what's waiting as soon as it can, looks whether
 * the internet is back, and keeps this week and next week on the device.
 */
export function useOfflineSync() {
  const { household } = useSession();
  const householdId = household?.id;
  const shoppingDay = household?.shopping_day;

  useEffect(() => {
    if (isDemo) return;
    const retry = () => (isOffline() ? checkConnection() : flushChanges());
    retry();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    const timer = setInterval(retry, RETRY_MS);
    if (Platform.OS !== 'web') {
      return () => {
        appState.remove();
        clearInterval(timer);
      };
    }

    // The app itself is kept on the device by the service worker (public/sw.js).
    if (!__DEV__ && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (navigator.onLine === false) setOffline(true);
    const goneOffline = () => setOffline(true);
    window.addEventListener('online', retry);
    window.addEventListener('offline', goneOffline);
    return () => {
      appState.remove();
      clearInterval(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', goneOffline);
    };
  }, []);

  useEffect(() => {
    if (isDemo || !householdId) return;
    const thisWeek = weekStartOf();
    keepWeekOnDevice(thisWeek);
    keepWeekOnDevice(addWeeks(thisWeek, 1));
    // The week starts on the shopping day, so that decides which weeks these are.
  }, [householdId, shoppingDay]);
}
