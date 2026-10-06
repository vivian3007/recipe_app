import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, EmptyState, Loading } from '@/components/ui';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import {
  addShoppingExtra,
  listShoppingChecks,
  listShoppingExtras,
  removeShoppingExtra,
  setShoppingCheck,
} from '@/lib/api';
import { dayShort, weekLabel } from '@/lib/dates';
import { buildShoppingList, formatAmount, type ShoppingItem } from '@/lib/quantities';
import { useSelectedWeek, useWeekFromLink } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { ShoppingExtra } from '@/lib/types';
import { useWeekPlan } from '@/lib/useWeekPlan';

export default function Shopping() {
  useWeekFromLink();
  const weekStart = useSelectedWeek();
  const { profile, household } = useSession();
  const { plan, meals, loading, error, reload } = useWeekPlan(weekStart);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ShoppingExtra[]>([]);
  const [newExtra, setNewExtra] = useState('');
  const [adding, setAdding] = useState(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadChecks = useCallback(async () => {
    if (!plan) {
      setChecked(new Set());
      setExtras([]);
      return;
    }
    const [checks, added] = await Promise.all([listShoppingChecks(plan.id), listShoppingExtras(plan.id)]);
    setChecked(checks);
    setExtras(added);
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      loadChecks();
    }, [loadChecks]),
  );

  const items = useMemo(
    () =>
      [
        ...buildShoppingList(meals),
        ...extras.map(
          (e): ShoppingItem => ({ key: `extra:${e.id}`, name: e.name, quantity: null, unit: '', recipes: [], extraId: e.id }),
        ),
      ].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
    [meals, extras],
  );
  const open = items.filter((i) => !checked.has(i.key));
  const done = items.filter((i) => checked.has(i.key));

  async function toggle(item: ShoppingItem) {
    if (!plan) return;
    const next = !checked.has(item.key);
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(item.key);
      else copy.delete(item.key);
      return copy;
    });
    try {
      await setShoppingCheck(plan.id, item.key, next);
    } catch {
      loadChecks();
    }
  }

  async function addExtra() {
    const name = newExtra.trim();
    if (!name || !household || !profile) return;
    setAdding(true);
    setExtraError(null);
    try {
      await addShoppingExtra(household.id, weekStart, profile.id, name);
      setNewExtra('');
      // Adding to an empty week creates its plan; reloading it then loads the extras too.
      if (plan) setExtras(await listShoppingExtras(plan.id));
      else await reload();
    } catch (e) {
      setExtraError(`Toevoegen lukte niet: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  async function removeExtra(item: ShoppingItem) {
    const extra = extras.find((e) => e.id === item.extraId);
    if (!extra) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExtras((prev) => prev.filter((e) => e.id !== extra.id));
    try {
      await removeShoppingExtra(extra);
    } catch {
      loadChecks();
    }
  }

  function share() {
    const lines = open.map((i) => `• ${[formatAmount(i.quantity, i.unit), i.name].filter(Boolean).join(' ')}`);
    Share.share({ message: `Boodschappen – ${weekLabel(weekStart).toLowerCase()}\n\n${lines.join('\n')}` });
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    await loadChecks();
    setRefreshing(false);
  }

  if (loading) return <Loading />;

  const addRow = (
    <View style={{ gap: spacing(1) }}>
      <View style={styles.addRow}>
        <TextInput
          value={newExtra}
          onChangeText={setNewExtra}
          onSubmitEditing={addExtra}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Iets toevoegen, bijv. melk"
          placeholderTextColor={colors.placeholder}
          style={styles.addInput}
        />
        <Pressable
          onPress={addExtra}
          disabled={!newExtra.trim() || adding}
          style={({ pressed }) => [styles.addButton, (!newExtra.trim() || adding || pressed) && { opacity: 0.5 }]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Toevoegen</Text>
        </Pressable>
      </View>
      {extraError && <Text style={styles.extraError}>{extraError}</Text>}
    </View>
  );

  return (
    <KeyboardScreen>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <WeekSwitcher weekStart={weekStart} />
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}

        {items.length === 0 ? (
          <>
            {addRow}
            <EmptyState
              icon="cart-outline"
              title="Nog niks op het lijstje"
              text="Kies gerechten in het weekplan, dan verschijnen de boodschappen hier vanzelf. Iets anders nodig? Zet het hierboven op het lijstje."
              action={<Button title="Naar weekplan" variant="secondary" onPress={() => router.navigate('/week')} />}
            />
          </>
        ) : (
          <>
            {meals.length > 0 && (
              <View style={styles.mealsBox}>
                {meals.map((m) => (
                  <View key={m.id}>
                    <Text style={styles.mealLine} numberOfLines={1}>
                      <Text style={{ fontWeight: '700' }}>{dayShort(weekStart, m.day)}</Text>  {m.recipe.title} · {m.servings} pers.
                    </Text>
                    {m.note && (
                      <View style={styles.noteRow}>
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.accent} />
                        <Text style={styles.note}>{m.note}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {addRow}

            <View style={styles.headerRow}>
              <Text style={styles.count}>
                {open.length} {open.length === 1 ? 'item' : 'items'} te halen
              </Text>
              <Pressable onPress={share} hitSlop={8} style={styles.share}>
                <Ionicons name="share-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.shareText}>Delen</Text>
              </Pressable>
            </View>

            {open.length > 0 && (
              <View style={styles.list}>
                {open.map((item) => (
                  <Row
                    key={item.key}
                    item={item}
                    checked={false}
                    onPress={() => toggle(item)}
                    onRemove={item.extraId ? () => removeExtra(item) : undefined}
                  />
                ))}
              </View>
            )}

            {done.length > 0 && (
              <>
                <Text style={styles.doneTitle}>In het mandje ({done.length})</Text>
                <View style={styles.list}>
                  {done.map((item) => (
                    <Row
                      key={item.key}
                      item={item}
                      checked
                      onPress={() => toggle(item)}
                      onRemove={item.extraId ? () => removeExtra(item) : undefined}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}

const useNativeDriver = Platform.OS !== 'web';

/**
 * Ticking off: the check pops in and the item is struck through, then the row fades and slides
 * away before it moves to the other list (where the list closes the gap smoothly).
 */
function Row({
  item,
  checked,
  onPress,
  onRemove,
}: {
  item: ShoppingItem;
  checked: boolean;
  onPress: () => void;
  /** Only for things added by hand; recipe ingredients come and go with the week plan. */
  onRemove?: () => void;
}) {
  const amount = formatAmount(item.quantity, item.unit);
  const [showChecked, setShowChecked] = useState(checked);
  const [busy, setBusy] = useState(false);
  const [pop] = useState(() => new Animated.Value(1));
  const [fade] = useState(() => new Animated.Value(1));
  const slide = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [checked ? -24 : 24, 0] }),
    [fade, checked],
  );

  function press() {
    if (busy) return;
    setBusy(true);
    setShowChecked(!checked);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onPress();
    };
    pop.setValue(0.4);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver }),
      Animated.timing(fade, { toValue: 0, duration: 220, delay: 180, useNativeDriver }),
    ]).start(finish);
    // The item is always ticked off, even if the animation gets interrupted (e.g. app in background).
    setTimeout(finish, 800);
  }

  return (
    <Animated.View
      style={{
        opacity: fade,
        transform: [{ translateX: slide }],
      }}
    >
      <Pressable onPress={press} style={styles.row}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Ionicons
            name={showChecked ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={showChecked ? colors.accent : colors.border}
          />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, showChecked && styles.checked]}>
            {amount ? <Text style={styles.amount}>{amount} </Text> : null}
            {item.name}
          </Text>
          <Text style={styles.itemRecipes} numberOfLines={1}>
            {item.extraId ? 'Zelf toegevoegd' : item.recipes.join(', ')}
          </Text>
        </View>
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`${item.name} van het lijstje halen`}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(10) },
  mealsBox: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing(4), gap: spacing(1) },
  mealLine: { fontSize: 14, color: colors.text },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1), marginLeft: spacing(9), marginTop: 2 },
  note: { flex: 1, fontSize: 13, fontStyle: 'italic', color: colors.accent },
  addRow: { flexDirection: 'row', gap: spacing(2) },
  addInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  extraError: { color: colors.danger, fontSize: 13 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) },
  count: { fontSize: 17, fontWeight: '800', color: colors.text },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
  },
  shareText: { color: colors.primaryDark, fontWeight: '700' },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { fontSize: 16, color: colors.text },
  amount: { fontWeight: '700' },
  checked: { textDecorationLine: 'line-through', color: colors.textMuted },
  itemRecipes: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  doneTitle: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginTop: spacing(2) },
});
