import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { onDataChanged, readCachedWeek } from './offlineCache';
import { fetchWeek } from './offlineQueue';
import { useSession } from './session';
import { OfflineError } from './supabase';
import type { ChooserOverrides, WeekPlan, WeekPlanMeal } from './types';

export function useWeekPlan(weekStart: string) {
  const { refresh } = useSession();
  // What's on this device shows straight away; the server follows when it can.
  const [cached] = useState(() => readCachedWeek(weekStart));
  const [plan, setPlan] = useState<WeekPlan | null>(cached?.plan ?? null);
  const [meals, setMeals] = useState<WeekPlanMeal[]>(cached?.meals ?? []);
  const [chooserOverrides, setChooserOverrides] = useState<ChooserOverrides>(
    cached?.chooserOverrides ?? Array(7).fill(undefined),
  );
  const [savedAt, setSavedAt] = useState<number | null>(cached?.savedAt ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const shownWeek = useRef(weekStart);
  const latestWeek = useRef(weekStart);

  const load = useCallback(async () => {
    latestWeek.current = weekStart;
    // Only when switching weeks: otherwise it would replace newer changes on screen with older ones.
    const stored = shownWeek.current === weekStart ? null : readCachedWeek(weekStart);
    if (stored) {
      setPlan(stored.plan);
      setMeals(stored.meals);
      setChooserOverrides(stored.chooserOverrides);
      setSavedAt(stored.savedAt);
      setError(null);
      setLoading(false);
      shownWeek.current = weekStart;
    }
    try {
      const result = await fetchWeek(weekStart);
      if (latestWeek.current !== weekStart) return;
      setPlan(result.plan);
      setMeals(result.meals);
      setChooserOverrides(result.chooserOverrides);
      setSavedAt(Date.now());
      setError(null);
      shownWeek.current = weekStart;
    } catch (e) {
      if (latestWeek.current !== weekStart) return;
      const nothingStored = shownWeek.current !== weekStart;
      // Without internet what's stored is fine, and the banner says so.
      if (!(e instanceof OfflineError) || nothingStored) setError((e as Error).message);
      if (nothingStored) {
        // Not the list of the week you came from under this week's name.
        setPlan(null);
        setMeals([]);
        setChooserOverrides(Array(7).fill(undefined));
        setSavedAt(null);
      }
    } finally {
      if (latestWeek.current === weekStart) setLoading(false);
    }
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Someone else may have changed the shopping day or the rotation.
      refresh();
    }, [load, refresh]),
  );

  useEffect(() => onDataChanged(load), [load]);

  return { plan, meals, setMeals, chooserOverrides, setChooserOverrides, savedAt, loading, error, reload: load };
}
