import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getWeekPlan } from './api';
import { useSession } from './session';
import type { ChooserOverrides, WeekPlan, WeekPlanMeal } from './types';

export function useWeekPlan(weekStart: string) {
  const { refresh } = useSession();
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [meals, setMeals] = useState<WeekPlanMeal[]>([]);
  const [chooserOverrides, setChooserOverrides] = useState<ChooserOverrides>(Array(7).fill(undefined));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getWeekPlan(weekStart);
      setPlan(result.plan);
      setMeals(result.meals);
      setChooserOverrides(result.chooserOverrides);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Someone else may have changed the shopping day or the rotation.
      refresh();
    }, [load, refresh]),
  );

  return { plan, meals, setMeals, chooserOverrides, setChooserOverrides, loading, error, reload: load };
}
