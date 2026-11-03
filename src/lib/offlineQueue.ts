import { getWeekPlan, listShoppingChecks, listShoppingExtras, removeShoppingExtra, setShoppingCheck, setShoppingExtraQuantity } from './api';
import {
  notifyDataChanged,
  patchCachedWeek,
  readCachedWeek,
  readStoredQueue,
  saveStoredQueue,
  setOffline,
} from './offlineCache';
import { isDemo, OfflineError, supabase } from './supabase';
import type { ShoppingExtra } from './types';

/** A change to the shopping list; without internet it waits here until it can be sent. */
export type ShoppingChange =
  | { type: 'check'; planId: string; key: string; checked: boolean }
  | { type: 'quantity'; extra: ShoppingExtra; quantity: number | null }
  | { type: 'remove'; extra: ShoppingExtra };

type Queued = ShoppingChange & { tries: number };
type Lists = { checks: Set<string>; extras: ShoppingExtra[] };

// A change the server keeps refusing shouldn't hold up the rest for good.
const MAX_TRIES = 5;

let queue = readStoredQueue<Queued>();
let flushing = false;

/**
 * Without a session Supabase sends its public key instead, and then reads come back empty and
 * deletes "work" without removing anything. So that counts as not being connected.
 */
async function requireSession() {
  if (isDemo) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new OfflineError();
}

function apply(change: ShoppingChange, { checks, extras }: Lists): Lists {
  if (change.type === 'check') {
    const next = new Set(checks);
    if (change.checked) next.add(change.key);
    else next.delete(change.key);
    return { checks: next, extras };
  }
  if (change.type === 'quantity') {
    return {
      checks,
      extras: extras.map((e) => (e.id === change.extra.id ? { ...e, quantity: change.quantity } : e)),
    };
  }
  return { checks, extras: extras.filter((e) => e.id !== change.extra.id) };
}

const planOf = (change: ShoppingChange) => (change.type === 'check' ? change.planId : change.extra.week_plan_id);

/** A newer change to the same thing replaces the one still waiting; a removed product needs no new amount. */
function replaces(newer: ShoppingChange, older: ShoppingChange) {
  if (newer.type === 'check') return older.type === 'check' && older.planId === newer.planId && older.key === newer.key;
  return older.type !== 'check' && older.extra.id === newer.extra.id;
}

function setQueue(next: Queued[]) {
  queue = next;
  saveStoredQueue(queue);
}

async function send(change: ShoppingChange) {
  if (change.type === 'check') await setShoppingCheck(change.planId, change.key, change.checked);
  else if (change.type === 'quantity') await setShoppingExtraQuantity(change.extra, change.quantity);
  else await removeShoppingExtra(change.extra);
}

/** Saves a change on this device straight away and sends it as soon as that's possible. */
export function changeShopping(weekStart: string, change: ShoppingChange) {
  setQueue([...queue.filter((q) => !replaces(change, q)), { ...change, tries: 0 }]);
  const week = readCachedWeek(weekStart);
  if (week) {
    const lists = apply(change, { checks: new Set(week.checks), extras: week.extras });
    patchCachedWeek(weekStart, { checks: [...lists.checks], extras: lists.extras });
  }
  return flushChanges();
}

/** Sends what's waiting, oldest first. Stops at the first sign of no internet and tries again later. */
export async function flushChanges() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  let dropped = false;
  try {
    await requireSession();
    const tried = new Set<Queued>();
    for (;;) {
      // Changes can be added while this runs.
      const next = queue.find((q) => !tried.has(q));
      if (!next) break;
      tried.add(next);
      try {
        await send(next);
        setQueue(queue.filter((q) => q !== next));
        setOffline(false);
      } catch (e) {
        if (e instanceof OfflineError) throw e;
        next.tries += 1;
        if (next.tries >= MAX_TRIES) {
          setQueue(queue.filter((q) => q !== next));
          dropped = true;
        } else {
          saveStoredQueue(queue);
        }
      }
    }
  } catch {
    setOffline(true);
  } finally {
    flushing = false;
  }
  // What's on screen is no longer what the server has.
  if (dropped) notifyDataChanged();
}

/** Whether anything comes through again, for when there's nothing waiting to be sent. */
export async function checkConnection() {
  if (queue.length > 0) return flushChanges();
  try {
    await requireSession();
    const { status } = await supabase.from('profiles').select('id').limit(1);
    setOffline(status === 0);
  } catch {
    setOffline(true);
  }
}

/** A week's plan from the server, also kept on this device. */
export async function fetchWeek(weekStart: string) {
  try {
    await requireSession();
    const week = await getWeekPlan(weekStart);
    patchCachedWeek(weekStart, { ...week, savedAt: Date.now() });
    setOffline(false);
    return week;
  } catch (e) {
    if (e instanceof OfflineError) setOffline(true);
    throw e;
  }
}

/** A week's ticks and added products from the server, also kept on this device, with what's still waiting on top. */
export async function fetchShoppingLists(weekStart: string, planId: string): Promise<Lists> {
  try {
    await requireSession();
    const [checks, extras] = await Promise.all([listShoppingChecks(planId), listShoppingExtras(planId)]);
    const lists = withWaitingChanges(planId, { checks, extras });
    patchCachedWeek(weekStart, { checks: [...lists.checks], extras: lists.extras, savedAt: Date.now() });
    setOffline(false);
    return lists;
  } catch (e) {
    if (e instanceof OfflineError) setOffline(true);
    throw e;
  }
}

export function withWaitingChanges(planId: string, lists: Lists) {
  return queue.filter((q) => planOf(q) === planId).reduce((result, q) => apply(q, result), lists);
}

/** Starting up: the weeks you may need in the shop are on the device before the internet goes. */
export async function keepWeekOnDevice(weekStart: string) {
  try {
    const { plan } = await fetchWeek(weekStart);
    if (plan) await fetchShoppingLists(weekStart, plan.id);
  } catch {
    // Then it stays what it was.
  }
}

/** Logging out: what still has to be sent goes with it. */
export function forgetChanges() {
  queue = [];
}
