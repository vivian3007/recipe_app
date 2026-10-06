// Push notifications in the Android app, via Expo's push service.
// The web app uses push.ts; both have the same functions.
import 'expo-sqlite/localStorage/install';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { PushState } from './push';
import { setSelectedWeek } from './selectedWeek';
import { supabase } from './supabase';

export type { PushState } from './push';

// Remembers on this phone that notifications were turned on (and for which token).
const STORAGE_KEY = 'weekmenu-push-token';

function storedToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Then the setting simply shows "off" next time.
  }
}

// Also show a notification while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function getPushState(): Promise<PushState> {
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  if (!granted && !canAskAgain) return 'blocked';
  return granted && storedToken() ? 'on' : 'off';
}

/** Asks for permission and stores where this phone can be reached. */
export async function enablePush(userId: string): Promise<PushState> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Weekmenu',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8613C',
    });
  }
  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
  if (!granted) return 'blocked';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('push_tokens').upsert({ token, user_id: userId, kind: 'expo', subscription: null });
  if (error) throw new Error(error.message);
  storeToken(token);
  return 'on';
}

export async function disablePush(): Promise<void> {
  const token = storedToken();
  if (token) await supabase.from('push_tokens').delete().eq('token', token);
  storeToken(null);
}

/** At start-up: keeps this phone's address up to date (it can change, e.g. after a reinstall). */
export async function refreshPush(userId: string): Promise<void> {
  if ((await getPushState()) === 'on') await enablePush(userId);
}

/** Opens the screen a tapped notification is about (the week plan or the shopping list). */
export function useOpenFromNotification() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { url, weekStart } = (response.notification.request.content.data ?? {}) as { url?: string; weekStart?: string };
    if (weekStart) setSelectedWeek(weekStart);
    if (url) router.push(url as Href);
  }, [response]);
}
