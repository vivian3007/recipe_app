import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeCard';
import { Chip, EmptyState, Loading, Stepper } from '@/components/ui';
import { addMeal, replaceMeal } from '@/lib/api';
import { dateOfDay, dayName, formatShort } from '@/lib/dates';
import { notify } from '@/lib/dialogs';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { DEFAULT_SERVINGS } from '@/lib/types';
import { useRecipes } from '@/lib/useRecipes';

export default function PickRecipe() {
  // With mealId, the chosen recipe replaces that dish; otherwise it is added to the day.
  const {
    weekStart,
    day: dayParam,
    mealId,
    servings: servingsParam,
  } = useLocalSearchParams<{ weekStart: string; day: string; mealId?: string; servings?: string }>();
  const day = Number(dayParam);
  const { household } = useSession();
  const { recipes, favorites, loading } = useRecipes();
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [servings, setServings] = useState(servingsParam ? Number(servingsParam) : DEFAULT_SERVINGS);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => (!onlyFavorites || favorites.has(r.id)) && (!q || `${r.title} ${r.tags.join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [recipes, favorites, query, onlyFavorites]);

  async function choose(recipeId: string) {
    if (!household || saving) return;
    setSaving(true);
    try {
      if (mealId) await replaceMeal(mealId, recipeId, servings);
      else await addMeal(household.id, weekStart, day, recipeId, servings);
      router.back();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <FlatList
      data={visible}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: spacing(3), marginBottom: spacing(2) }}>
          <View style={styles.dayBox}>
            <View>
              <Text style={styles.dayName}>{dayName(weekStart, day)}</Text>
              <Text style={styles.dayDate}>{formatShort(dateOfDay(weekStart, day))}</Text>
            </View>
            <Stepper value={servings} onChange={setServings} suffix="pers." />
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Zoek…"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
            <Chip label="Alles" active={!onlyFavorites} onPress={() => setOnlyFavorites(false)} />
            <Chip label="Mijn favorieten" icon="heart" active={onlyFavorites} onPress={() => setOnlyFavorites(true)} />
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="search" title="Geen recepten gevonden" />}
      renderItem={({ item }) => (
        <Pressable onPress={() => choose(item.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
          <View style={{ width: 56 }}>
            <RecipeImage uri={item.image_url} height={56} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.prep_minutes != null && <Text style={styles.meta}>{item.prep_minutes} min</Text>}
          </View>
          {favorites.has(item.id) && <Ionicons name="heart" size={18} color={colors.primary} />}
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(2), paddingBottom: spacing(10) },
  dayBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  dayName: { fontSize: 18, fontWeight: '800', color: colors.text },
  dayDate: { fontSize: 13, color: colors.textMuted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(3),
  },
  searchInput: { flex: 1, paddingVertical: spacing(3), fontSize: 16, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
