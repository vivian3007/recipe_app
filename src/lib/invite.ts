import 'expo-sqlite/localStorage/install';
import { Platform } from 'react-native';

// An invitation is a link with the family's code in it. The code is kept on the device while the
// person logs in or makes an account, and used as soon as they can join.
const STORAGE_KEY = 'weekmenu.invite';
const WEB_APP = 'https://weekmenu.expo.app';

export const INVITE_PATH = 'doe-mee';

export function inviteLink(code: string) {
  const base = Platform.OS === 'web' ? window.location.origin : WEB_APP;
  return `${base}/${INVITE_PATH}/${encodeURIComponent(code)}`;
}

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    // Then the code can still be typed in by hand.
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear then.
  }
}
