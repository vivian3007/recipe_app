import 'expo-sqlite/localStorage/install';
import { useSyncExternalStore } from 'react';

import { isDemo } from './supabase';
import type { ChooserOverrides, Household, Profile, ShoppingExtra, WeekPlan, WeekPlanMeal } from './types';

// What the app needs without internet, kept on this device: who's logged in and the latest weeks.
// Demo mode has all its data on the device already, so it keeps nothing here.
const PREFIX = 'weekmenu.offline.';
const SESSION_KEY = `${PREFIX}session`;
const WEEKS_KEY = `${PREFIX}weeks`;
const QUEUE_KEY = `${PREFIX}queue`;
const WEEKS_KEPT = 4;

export function readStored<T>(key: string): T | null {
  if (isDemo) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown) {
  if (isDemo) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works, just not without internet.
  }
}

// ---------- Who's logged in ----------

export type SessionSnapshot = { profile: Profile; household: Household | null; members: Profile[] };

export const readSessionSnapshot = () => readStored<SessionSnapshot>(SESSION_KEY);
export const saveSessionSnapshot = (snapshot: SessionSnapshot) => writeStored(SESSION_KEY, snapshot);

// ---------- The latest weeks ----------

export type CachedWeek = {
  plan: WeekPlan | null;
  meals: WeekPlanMeal[];
  chooserOverrides: ChooserOverrides;
  checks: string[];
  extras: ShoppingExtra[];
  /** When this was last fetched. */
  savedAt: number;
};

// JSON turns undefined into null, but in chooserOverrides those mean different things: only what's set is stored.
type StoredWeek = Omit<CachedWeek, 'chooserOverrides'> & { choosers: [number, string | null][] };

const weekKey = (weekStart: string) => `${PREFIX}week.${weekStart}`;

export function readCachedWeek(weekStart: string): CachedWeek | null {
  const stored = readStored<StoredWeek>(weekKey(weekStart));
  if (!stored) return null;
  const { choosers, ...week } = stored;
  const chooserOverrides: ChooserOverrides = Array(7).fill(undefined);
  for (const [day, chooser] of choosers) chooserOverrides[day] = chooser;
  return { ...week, chooserOverrides };
}

/** Changes the stored week; only the newest weeks stay on the device. */
export function patchCachedWeek(weekStart: string, patch: Partial<CachedWeek>) {
  if (isDemo) return;
  const week: CachedWeek = {
    plan: null,
    meals: [],
    chooserOverrides: Array(7).fill(undefined),
    checks: [],
    extras: [],
    savedAt: 0,
    ...readCachedWeek(weekStart),
    ...patch,
  };
  const { chooserOverrides, ...rest } = week;
  const choosers: StoredWeek['choosers'] = [];
  chooserOverrides.forEach((chooser, day) => {
    if (chooser !== undefined) choosers.push([day, chooser]);
  });
  writeStored(weekKey(weekStart), { ...rest, choosers });

  const weeks = [...new Set([...(readStored<string[]>(WEEKS_KEY) ?? []), weekStart])].sort().reverse();
  for (const old of weeks.slice(WEEKS_KEPT)) localStorage.removeItem(weekKey(old));
  writeStored(WEEKS_KEY, weeks.slice(0, WEEKS_KEPT));
}

// ---------- Changes that still have to be sent ----------

export const readStoredQueue = <T>() => readStored<T[]>(QUEUE_KEY) ?? [];
export const saveStoredQueue = (queue: unknown[]) => writeStored(QUEUE_KEY, queue);

/** After logging out nothing of this family stays on the device. */
export function clearOfflineData() {
  if (isDemo) return;
  for (const week of readStored<string[]>(WEEKS_KEY) ?? []) localStorage.removeItem(weekKey(week));
  for (const key of [WEEKS_KEY, SESSION_KEY, QUEUE_KEY]) localStorage.removeItem(key);
}

// ---------- Is there internet? ----------

let offline = false;
const statusListeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

/** Failed requests tell us there's no internet; a request that works, that it's back. */
export function setOffline(next: boolean) {
  if (next === offline) return;
  offline = next;
  statusListeners.forEach((l) => l());
  if (!next) notifyDataChanged();
}

export const isOffline = () => offline;

export function useIsOffline() {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => offline,
  );
}

/** The internet is back or changes turned out differently: what's on screen should be fetched again. */
export function notifyDataChanged() {
  reconnectListeners.forEach((l) => l());
}

export function onDataChanged(listener: () => void) {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}
