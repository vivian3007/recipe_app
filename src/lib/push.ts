// Push notifications in the web app (on an iPhone: the app on the home screen) via Web Push.
// The Android app uses push.native.ts; both have the same functions.
import { supabase } from './supabase';

/**
 * on: this device gets notifications. off: not (yet) turned on. blocked: the browser or phone
 * doesn't allow them. install-first: on an iPhone, add the app to the home screen first.
 * unsupported: this browser can't receive push notifications.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install-first' | 'unsupported';

const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** The service worker that shows the notifications (public/sw.js). */
function registration() {
  return navigator.serviceWorker.register('/sw.js');
}

function base64UrlToBytes(base64Url: string) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) {
    return isIos() && !isInstalled() ? 'install-first' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await (await registration()).pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/** Asks for permission and stores where this browser can be reached. */
export async function enablePush(userId: string): Promise<PushState> {
  const state = await getPushState();
  if (state === 'unsupported' || state === 'install-first' || state === 'blocked') return state;
  if ((await Notification.requestPermission()) !== 'granted') return 'blocked';
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey!) }));
  const { error } = await supabase.from('push_tokens').upsert({
    token: subscription.endpoint,
    user_id: userId,
    kind: 'web',
    subscription: subscription.toJSON(),
  });
  if (error) throw new Error(error.message);
  return 'on';
}

export async function disablePush(): Promise<void> {
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from('push_tokens').delete().eq('token', subscription.endpoint);
  await subscription.unsubscribe();
}

/** At start-up: keeps this browser's address up to date (e.g. after logging in as someone else). */
export async function refreshPush(userId: string): Promise<void> {
  if ((await getPushState()) === 'on') await enablePush(userId);
}

/** On the web a tapped notification opens its page itself (see public/sw.js). */
export function useOpenFromNotification() {}
