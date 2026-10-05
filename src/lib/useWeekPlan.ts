import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getWeekPlan } from './api';
import type { DayChoosers, WeekPlan, WeekPlanMeal } from './types';

export function useWeekPlan(weekStart: string) {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [meals, setMeals] = useState<WeekPlanMeal[]>([]);
  const [choosers, setChoosers] = useState<DayChoosers>(Array(7).fill(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getWeekPlan(weekStart);
      setPlan(result.plan);
      setMeals(result.meals);
      setChoosers(result.choosers);
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
    }, [load]),
  );

  return { plan, meals, setMeals, choosers, setChoosers, loading, error, reload: load };
}
