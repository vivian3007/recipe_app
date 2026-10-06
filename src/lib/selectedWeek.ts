import { useLocalSearchParams } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { dateOfDay, getShoppingDay, setShoppingDay, weekStartOf } from './dates';

// The week shown on the Weekplan and Boodschappen tabs is shared, so switching
// to next week on one tab also shows next week's list on the other.
let current = weekStartOf();
const listeners = new Set<() => void>();

export function setSelectedWeek(weekStart: string) {
  current = weekStart;
  listeners.forEach((l) => l());
}

export function useSelectedWeek(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** A notification links to a week (?week=YYYY-MM-DD): show that week. */
export function useWeekFromLink() {
  const { week } = useLocalSearchParams<{ week?: string }>();
  useEffect(() => {
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) setSelectedWeek(week);
  }, [week]);
}

/** Weeks start on the household's shopping day; when it changes, the selected week follows. */
export function applyShoppingDay(day: number) {
  if (day === getShoppingDay()) return;
  const wasThisWeek = current === weekStartOf();
  setShoppingDay(day);
  // Otherwise: the new week that holds most days of the week that was shown.
  setSelectedWeek(wasThisWeek ? weekStartOf() : weekStartOf(dateOfDay(current, 3)));
}
