import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeCard';
import { Button, Loading, Stepper } from '@/components/ui';
import { deleteRecipe, getRecipe, getWeekPlan, listFavoriteIds, setFavorite } from '@/lib/api';
import { confirm, notify } from '@/lib/dialogs';
import { formatAmount, scaleIngredient } from '@/lib/quantities';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { DAY_NAMES } from '@/lib/dates';
import { mealIngredients, type RecipeWithIngredients, type WeekPlanMeal } from '@/lib/types';

export default function RecipeDetail() {
  // Opened from the week plan, mealId/weekStart point to that evening, which may have its own adjustments.
  const {
    id,
    servings: servingsParam,
    mealId,
    weekStart,
  } = useLocalSearchParams<{ id: string; servings?: string; mealId?: string; weekStart?: string }>();
  const { profile } = useSession();
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [meal, setMeal] = useState<WeekPlanMeal | null>(null);
  const [favorite, setFav] = useState(false);
  const [servings, setServings] = useState<number | null>(servingsParam ? Number(servingsParam) : null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      Promise.all([getRecipe(id), listFavoriteIds(profile.id)])
        .then(([r, favs]) => {
          setRecipe(r);
          setFav(favs.has(r.id));
          setServings((s) => s ?? r.servings);
        })
        .catch((e) => setError((e as Error).message));
      if (mealId && weekStart) {
        getWeekPlan(weekStart)
          .then(({ meals }) => setMeal(meals.find((m) => m.id === mealId) ?? null))
          .catch(() => setMeal(null));
      }
    }, [id, profile, mealId, weekStart]),
  );

  async function toggleFavorite() {
    if (!profile || !recipe) return;
    setFav(!favorite);
    await setFavorite(profile.id, recipe.id, !favorite).catch(() => setFav(favorite));
  }

  async function confirmDelete() {
    if (!recipe) return;
    const message = `"${recipe.title}" wordt voor het hele gezin verwijderd, ook uit weekplannen.`;
    if (!(await confirm('Recept verwijderen?', message, 'Verwijderen', true))) return;
    try {
      await deleteRecipe(recipe.id);
      router.back();
    } catch (e) {
      notify('Verwijderen mislukt', (e as Error).message);
    }
  }

  function openSource() {
    if (!recipe?.source_url) return;
    Linking.openURL(recipe.source_url).catch(() =>
      notify('Kan de link niet openen', recipe.source_url ?? ''),
    );
  }

  if (error) return <Text style={{ padding: spacing(5), color: colors.danger }}>{error}</Text>;
  if (!recipe || servings == null) return <Loading />;

  const factor = servings / recipe.servings;
  const ingredients = meal ? mealIngredients(meal) : recipe.recipe_ingredients;
  const isAdjusted = !!meal && (!!meal.note || !!meal.custom_ingredients);
  const steps = (recipe.instructions ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing(5) }}>
              <Pressable hitSlop={10} onPress={toggleFavorite}>
                <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={24} color={colors.primary} />
              </Pressable>
              <Pressable hitSlop={10} onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })}>
                <Ionicons name="create-outline" size={24} color={colors.primaryDark} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing(12) }}>
        <RecipeImage uri={recipe.image_url} height={240} rounded={false} />
        <View style={styles.body}>
          <Text style={styles.title}>{recipe.title}</Text>
          <View style={styles.metaRow}>
            {recipe.prep_minutes != null && (
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text style={styles.metaText}>{recipe.prep_minutes} minuten</Text>
              </View>
            )}
            {recipe.author?.display_name && (
              <View style={styles.meta}>
                <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                <Text style={styles.metaText}>{recipe.author.display_name}</Text>
              </View>
            )}
          </View>
          {recipe.tags.length > 0 && (
            <View style={styles.tags}>
              {recipe.tags.map((t) => (
                <Text key={t} style={styles.tag}>
                  {t}
                </Text>
              ))}
            </View>
          )}
          {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
          {recipe.source_url && (
            <Pressable onPress={openSource} style={({ pressed }) => [styles.source, pressed && { opacity: 0.6 }]}>
              <Ionicons name="globe-outline" size={18} color={colors.accent} />
              <Text style={styles.sourceText} numberOfLines={1}>
                Bekijk origineel recept op {hostOf(recipe.source_url)}
              </Text>
              <Ionicons name="open-outline" size={16} color={colors.accent} />
            </Pressable>
          )}

          <Button
            title="Toevoegen aan weekplan"
            icon="calendar"
            onPress={() => router.push({ pathname: '/add-to-week', params: { id: recipe.id } })}
          />

          {isAdjusted && meal && (
            <Pressable
              style={styles.adjusted}
              onPress={() => router.push({ pathname: '/adjust-meal', params: { weekStart: weekStart!, mealId: meal.id } })}
            >
              <Ionicons name="create" size={20} color={colors.primaryDark} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.adjustedTitle}>Aangepast voor {DAY_NAMES[meal.day].toLowerCase()}</Text>
                {meal.note && <Text style={styles.adjustedNote}>{meal.note}</Text>}
                {meal.custom_ingredients && (
                  <Text style={styles.adjustedHint}>De ingrediënten hieronder zijn aangepast voor deze avond.</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
            </Pressable>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingrediënten</Text>
            <Stepper value={servings} onChange={setServings} suffix="pers." />
          </View>
          <View style={styles.ingredients}>
            {ingredients.length === 0 && <Text style={styles.metaText}>Geen ingrediënten ingevuld.</Text>}
            {ingredients.map((ing, i) => {
              const scaled = scaleIngredient(ing, factor);
              return (
                <View key={ing.id ?? i} style={styles.ingredient}>
                  <Text style={styles.amount}>{formatAmount(scaled.quantity, scaled.unit)}</Text>
                  <Text style={styles.ingredientName}>{ing.name}</Text>
                </View>
              );
            })}
          </View>

          {steps.length === 0 && recipe.source_url && (
            <>
              <Text style={styles.sectionTitle}>Bereiding</Text>
              <Text style={styles.metaText}>
                De bereiding staat op de website. Tik hierboven op &quot;Bekijk origineel recept&quot;.
              </Text>
            </>
          )}
          {steps.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Bereiding</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          )}

          {recipe.created_by === profile?.id && (
            <Button title="Recept verwijderen" variant="danger" icon="trash-outline" onPress={confirmDelete} style={{ marginTop: spacing(6) }} />
          )}
        </View>
      </ScrollView>
    </>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'de website';
  }
}

const styles = StyleSheet.create({
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
  },
  sourceText: { flex: 1, color: colors.accent, fontWeight: '700', fontSize: 14 },
  body: { padding: spacing(5), gap: spacing(4) },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  metaRow: { flexDirection: 'row', gap: spacing(4), flexWrap: 'wrap', marginTop: -spacing(2) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  metaText: { fontSize: 14, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  tag: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  description: { fontSize: 16, color: colors.text, lineHeight: 23 },
  adjusted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  adjustedTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  adjustedNote: { fontSize: 15, color: colors.text },
  adjustedHint: { fontSize: 13, color: colors.textMuted },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing(2) },
  ingredients: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(3),
  },
  ingredient: { flexDirection: 'row', gap: spacing(3) },
  amount: { width: 84, fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  ingredientName: { flex: 1, fontSize: 16, color: colors.text },
  step: { flexDirection: 'row', gap: spacing(3) },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { color: '#fff', fontWeight: '800' },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24, color: colors.text },
});
