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
  View,
} from 'react-native';

import { Button, EmptyState, Loading } from '@/components/ui';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import { listShoppingChecks, setShoppingCheck } from '@/lib/api';
import { DAY_SHORT, weekLabel } from '@/lib/dates';
import { buildShoppingList, formatAmount, type ShoppingItem } from '@/lib/quantities';
import { useSelectedWeek } from '@/lib/selectedWeek';
import { colors, radius, spacing } from '@/lib/theme';
import { useWeekPlan } from '@/lib/useWeekPlan';

export default function Shopping() {
  const weekStart = useSelectedWeek();
  const { plan, meals, loading, error, reload } = useWeekPlan(weekStart);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const loadChecks = useCallback(async () => {
    setChecked(plan ? await listShoppingChecks(plan.id) : new Set());
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      loadChecks();
    }, [loadChecks]),
  );

  const items = useMemo(() => buildShoppingList(meals), [meals]);
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <WeekSwitcher weekStart={weekStart} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {meals.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Nog niks op het lijstje"
          text="Kies eerst gerechten in het weekplan. De boodschappen verschijnen hier vanzelf."
          action={<Button title="Naar weekplan" variant="secondary" onPress={() => router.navigate('/week')} />}
        />
      ) : (
        <>
          <View style={styles.mealsBox}>
            {meals.map((m) => (
              <Text key={m.id} style={styles.mealLine} numberOfLines={1}>
                <Text style={{ fontWeight: '700' }}>{DAY_SHORT[m.day]}</Text>  {m.recipe.title} · {m.servings} pers.
              </Text>
            ))}
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.count}>
              {open.length} {open.length === 1 ? 'item' : 'items'} te halen
            </Text>
            <Pressable onPress={share} hitSlop={8} style={styles.share}>
              <Ionicons name="share-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.shareText}>Delen</Text>
            </Pressable>
          </View>

          <View style={styles.list}>
            {open.map((item) => (
              <Row key={item.key} item={item} checked={false} onPress={() => toggle(item)} />
            ))}
          </View>

          {done.length > 0 && (
            <>
              <Text style={styles.doneTitle}>In het mandje ({done.length})</Text>
              <View style={styles.list}>
                {done.map((item) => (
                  <Row key={item.key} item={item} checked onPress={() => toggle(item)} />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const useNativeDriver = Platform.OS !== 'web';

/**
 * Ticking off: the check pops in and the item is struck through, then the row fades and slides
 * away before it moves to the other list (where the list closes the gap smoothly).
 */
function Row({ item, checked, onPress }: { item: ShoppingItem; checked: boolean; onPress: () => void }) {
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
            {item.recipes.join(', ')}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(10) },
  mealsBox: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing(4), gap: spacing(1) },
  mealLine: { fontSize: 14, color: colors.text },
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
