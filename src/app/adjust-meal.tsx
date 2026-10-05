import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  IngredientEditor,
  rowsFromIngredients,
  rowsToIngredients,
  type IngredientRow,
} from '@/components/IngredientEditor';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, Field, Loading } from '@/components/ui';
import { getWeekPlan, updateMealAdjustments } from '@/lib/api';
import { DAY_NAMES } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { mealIngredients, type Ingredient, type WeekPlanMeal } from '@/lib/types';
import { useConfirmLeave } from '@/lib/useConfirmLeave';

/** Compares ingredient lists the way they would end up on the shopping list. */
function sameIngredients(a: Ingredient[], b: Ingredient[]) {
  const key = (list: Ingredient[]) =>
    JSON.stringify(list.map((i) => [i.name.trim().toLowerCase(), i.quantity ?? null, (i.unit ?? '').trim().toLowerCase()]));
  return key(a) === key(b);
}

/** Adjust one planned dish for that evening only (note + ingredients); the recipe itself stays as it is. */
export default function AdjustMeal() {
  const { weekStart, mealId } = useLocalSearchParams<{ weekStart: string; mealId: string }>();
  const { profile } = useSession();
  const [meal, setMeal] = useState<WeekPlanMeal | null>(null);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWeekPlan(weekStart)
      .then(({ meals }) => {
        const found = meals.find((m) => m.id === mealId);
        if (!found) throw new Error('Dit gerecht staat niet meer in het weekplan.');
        setMeal(found);
        setNote(found.note ?? '');
        setRows(rowsFromIngredients(mealIngredients(found)));
      })
      .catch((e) => {
        Alert.alert('Laden mislukt', (e as Error).message);
        router.back();
      });
  }, [weekStart, mealId]);

  async function save(adjustments: { note: string | null; custom_ingredients: Ingredient[] | null }) {
    if (!meal) return;
    setSaving(true);
    try {
      await updateMealAdjustments(meal.id, adjustments);
      router.back();
    } catch (e) {
      Alert.alert('Opslaan mislukt', (e as Error).message);
      setSaving(false);
    }
  }

  function saveForm() {
    if (!meal) return;
    const ingredients = rowsToIngredients(rows);
    save({
      note: note.trim() || null,
      // Unchanged ingredients are not stored, so later edits to the recipe still come through.
      custom_ingredients: sameIngredients(ingredients, meal.recipe.recipe_ingredients) ? null : ingredients,
    });
  }

  function confirmReset() {
    Alert.alert('Terug naar het origineel?', 'Je opmerking en aangepaste ingrediënten voor deze avond worden gewist.', [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Terugzetten', style: 'destructive', onPress: () => save({ note: null, custom_ingredients: null }) },
    ]);
  }

  const hasChanges =
    !!meal &&
    (note.trim() !== (meal.note ?? '').trim() || !sameIngredients(rowsToIngredients(rows), mealIngredients(meal)));
  useConfirmLeave(hasChanges && !saving);

  if (!meal) return <Loading />;

  const author =
    meal.recipe.created_by === profile?.id ? 'jouw recept' : `het recept van ${meal.recipe.author?.display_name ?? 'het gezin'}`;
  const isAdjusted = !!meal.note || !!meal.custom_ingredients;

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>
          <Text style={styles.title}>{meal.recipe.title}</Text>
          <Text style={styles.subtitle}>
            {DAY_NAMES[meal.day]} · {meal.servings} personen
          </Text>
        </View>

        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.infoText}>
            Alleen voor deze avond. {author.charAt(0).toUpperCase() + author.slice(1)} blijft gewoon hetzelfde, en het
            boodschappenlijstje rekent met jouw aanpassing.
          </Text>
        </View>

        <Field
          label="Opmerking"
          value={note}
          onChangeText={setNote}
          placeholder="Bijv. met kip i.p.v. gehakt"
          multiline
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />

        <View style={{ gap: spacing(1) }}>
          <Text style={styles.label}>Ingrediënten voor deze keer</Text>
          <Text style={styles.hint}>
            Hoeveelheden voor {meal.recipe.servings} personen, zoals in het recept. De app rekent het om naar{' '}
            {meal.servings}.
          </Text>
        </View>
        <IngredientEditor rows={rows} onChange={setRows} />

        <Button title="Opslaan voor deze avond" icon="checkmark" onPress={saveForm} loading={saving} />
        {isAdjusted && (
          <Button title="Terug naar het originele recept" variant="ghost" icon="arrow-undo" onPress={confirmReset} />
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(16) },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted },
  info: {
    flexDirection: 'row',
    gap: spacing(3),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
