import { useSyncExternalStore } from 'react';

import { weekStartOf } from './dates';

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
