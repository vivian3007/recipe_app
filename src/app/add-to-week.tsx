import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Loading, Stepper } from '@/components/ui';
import { addMeal, getRecipe, getWeekPlan, replaceMeal } from '@/lib/api';
import { DAY_NAMES, addWeeks, dateOfDay, formatShort, weekLabel, weekRange } from '@/lib/dates';
import { setSelectedWeek, useSelectedWeek } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { DEFAULT_SERVINGS, type RecipeWithIngredients, type WeekPlanMeal } from '@/lib/types';

export default function AddToWeek() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household } = useSession();
  const selectedWeek = useSelectedWeek();
  const [weekStart, setWeekStart] = useState(selectedWeek);
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  // Meals are stored with the week they belong to, so a stale week shows as loading.
  const [loaded, setLoaded] = useState<{ weekStart: string; meals: WeekPlanMeal[] } | null>(null);
  const meals = loaded?.weekStart === weekStart ? loaded.meals : null;
  const [servings, setServings] = useState(DEFAULT_SERVINGS);

  useEffect(() => {
    getRecipe(id).then(setRecipe);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getWeekPlan(weekStart).then((r) => {
      if (!cancelled) setLoaded({ weekStart, meals: r.meals });
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  /** Adds the dish to the day, or puts it in place of `replacing`. */
  async function add(day: number, replacing?: WeekPlanMeal) {
    if (!household) return;
    try {
      if (replacing) await replaceMeal(replacing.id, id, servings);
      else await addMeal(household.id, weekStart, day, id, servings);
      setSelectedWeek(weekStart);
      router.back();
    } catch (e) {
      Alert.alert('Toevoegen mislukt', (e as Error).message);
    }
  }

  function onDay(day: number) {
    const existing = meals?.filter((m) => m.day === day) ?? [];
    if (existing.length === 0) return add(day);
    const titles = existing.map((m) => m.recipe.title).join(' en ');
    Alert.alert('Al iets gepland', `Op ${DAY_NAMES[day].toLowerCase()} staat al ${titles}. Wil je dit gerecht erbij zetten?`, [
      { text: 'Annuleren', style: 'cancel' },
      // Replacing is only clear when there is exactly one dish.
      ...(existing.length === 1 ? [{ text: 'Vervangen', onPress: () => add(day, existing[0]) }] : []),
      { text: 'Erbij zetten', onPress: () => add(day) },
    ]);
  }

  if (!recipe) return <Loading />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.recipeTitle}>{recipe.title}</Text>

      <View style={styles.servingsRow}>
        <Text style={styles.label}>Voor hoeveel personen?</Text>
        <Stepper value={servings} onChange={setServings} suffix="pers." />
      </View>

      <View style={styles.weekRow}>
        <Pressable hitSlop={12} onPress={() => setWeekStart(addWeeks(weekStart, -1))}>
          <Ionicons name="chevron-back" size={24} color={colors.primaryDark} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.weekLabel}>{weekLabel(weekStart)}</Text>
          <Text style={styles.weekRange}>{weekRange(weekStart)}</Text>
        </View>
        <Pressable hitSlop={12} onPress={() => setWeekStart(addWeeks(weekStart, 1))}>
          <Ionicons name="chevron-forward" size={24} color={colors.primaryDark} />
        </Pressable>
      </View>

      <Text style={styles.label}>Kies een dag</Text>
      {meals == null ? (
        <Loading />
      ) : (
        DAY_NAMES.map((name, day) => {
          const existing = meals.filter((m) => m.day === day);
          return (
            <Pressable key={day} onPress={() => onDay(day)} style={({ pressed }) => [styles.day, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayName}>
                  {name} <Text style={styles.dayDate}>{formatShort(dateOfDay(weekStart, day))}</Text>
                </Text>
                <Text style={[styles.dayMeal, !existing.length && { color: colors.accent }]} numberOfLines={1}>
                  {existing.length ? existing.map((m) => m.recipe.title).join(' + ') : 'Nog vrij'}
                </Text>
              </View>
              <Ionicons
                name={existing.length ? 'add-circle-outline' : 'add-circle'}
                size={24}
                color={existing.length ? colors.textMuted : colors.primary}
              />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), gap: spacing(3), paddingBottom: spacing(10) },
  recipeTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  servingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
  },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing(3),
  },
  weekLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  weekRange: { fontSize: 13, color: colors.textMuted },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
  },
  dayName: { fontSize: 16, fontWeight: '700', color: colors.text },
  dayDate: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  dayMeal: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
});
