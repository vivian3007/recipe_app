import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AisleEditor } from '@/components/AisleEditor';
import { AislePicker } from '@/components/AislePicker';
import { AmountDialog } from '@/components/AmountDialog';
import { OfflineBanner } from '@/components/OfflineBanner';
import { aisleOf } from '@/lib/aisles';
import { addShoppingExtra } from '@/lib/api';
import { dateOfDay, dayShort, formatShort, weekLabel } from '@/lib/dates';
import { onDataChanged, readCachedWeek } from '@/lib/offlineCache';
import { changeShopping, fetchShoppingLists, withWaitingChanges } from '@/lib/offlineQueue';
import { buildShoppingList, formatAmount, type ShoppingItem } from '@/lib/quantities';
import { useSelectedWeek, useWeekFromLink } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { ShoppingExtra } from '@/lib/types';
import { useAisles } from '@/lib/useAisles';
import { useWeekPlan } from '@/lib/useWeekPlan';

/** Recipe ingredients someone took off this week's list are kept as a check with this prefix. */
const HIDDEN = 'weg:';
/** A changed amount of a recipe ingredient this week, kept as a check: "aantal:1:mozzarella|bol". */
const AMOUNT = 'aantal:';

/** The changed amounts this week, per item key. */
function changedAmounts(checks: Set<string>) {
  const amounts = new Map<string, { quantity: number; check: string }>();
  for (const check of checks) {
    if (!check.startsWith(AMOUNT)) continue;
    const rest = check.slice(AMOUNT.length);
    const colon = rest.indexOf(':');
    const quantity = Number(rest.slice(0, colon));
    if (colon > 0 && Number.isFinite(quantity)) amounts.set(rest.slice(colon + 1), { quantity, check });
  }
  return amounts;
}

export default function Shopping() {
  useWeekFromLink();
  const weekStart = useSelectedWeek();
  const { profile, household } = useSession();
  const { aisles: shopAisles, setup, overrides, moveTo, saveSetup, moveToNewAisle } = useAisles();
  // The product whose aisle is being chosen.
  const [moving, setMoving] = useState<ShoppingItem | null>(null);
  const [editingAisles, setEditingAisles] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // The product whose amount is being changed.
  const [changing, setChanging] = useState<ShoppingItem | null>(null);
  const { plan, meals, savedAt, loading, error, reload } = useWeekPlan(weekStart);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ShoppingExtra[]>([]);
  const [newExtra, setNewExtra] = useState('');
  const [adding, setAdding] = useState(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Which plan's ticks are on screen: what's on this device only shows when arriving at a plan.
  const shownPlan = useRef<string | null>(null);

  const loadChecks = useCallback(async () => {
    if (!plan) {
      shownPlan.current = null;
      setChecked(new Set());
      setExtras([]);
      return;
    }
    if (shownPlan.current !== plan.id) {
      shownPlan.current = plan.id;
      const stored = readCachedWeek(plan.week_start);
      const lists = withWaitingChanges(plan.id, {
        checks: new Set(stored?.plan?.id === plan.id ? stored.checks : []),
        extras: stored?.plan?.id === plan.id ? stored.extras : [],
      });
      setChecked(lists.checks);
      setExtras(lists.extras);
    }
    try {
      const lists = await fetchShoppingLists(plan.week_start, plan.id);
      if (shownPlan.current !== plan.id) return;
      setChecked(lists.checks);
      setExtras(lists.extras);
    } catch {
      // No internet: what's stored stays on screen.
    }
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      loadChecks();
    }, [loadChecks]),
  );

  useEffect(() => onDataChanged(loadChecks), [loadChecks]);

  const amounts = useMemo(() => changedAmounts(checked), [checked]);
  const items = useMemo(
    () =>
      [
        ...buildShoppingList(meals).map((item) => {
          const changed = amounts.get(item.key);
          return changed ? { ...item, quantity: changed.quantity, planned: item.quantity } : item;
        }),
        ...extras.map(
          (e): ShoppingItem => ({
            key: `extra:${e.id}`,
            name: e.name,
            quantity: e.quantity ?? null,
            unit: '',
            recipes: [],
            extraId: e.id,
            staple: household?.staples.find((s) => s.id === e.staple_id)?.name,
          }),
        ),
      ].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
    [meals, extras, household?.staples, amounts],
  );
  // Recipe ingredients you don't need this week (you still have them, say): out of sight, but they can go back.
  const hidden = items.filter((i) => checked.has(HIDDEN + i.key));
  const visible = items.filter((i) => !checked.has(HIDDEN + i.key));
  const open = visible.filter((i) => !checked.has(i.key));
  const done = visible.filter((i) => checked.has(i.key));
  // What's still to get, per aisle in the order you walk through the shop.
  // From the vaste boodschappen, "Thee rooibos" goes where "Thee" goes, unless it was moved itself.
  const aisleOfItem = (i: ShoppingItem) =>
    aisleOf(i.staple && !overrides[i.name.trim().toLowerCase()] ? i.staple : i.name, overrides, shopAisles);
  const aisles = shopAisles.map((a) => ({ aisle: a, items: open.filter((i) => aisleOfItem(i) === a.key) })).filter(
    (group) => group.items.length > 0,
  );

  function setCheck(key: string, next: boolean) {
    if (!plan) return;
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
    changeShopping(plan.week_start, { type: 'check', planId: plan.id, key, checked: next });
  }

  const toggle = (item: ShoppingItem) => setCheck(item.key, !checked.has(item.key));

  /** Off the list: what was added by hand is deleted, a recipe ingredient is hidden for this week. */
  function remove(item: ShoppingItem) {
    if (item.extraId) return removeExtra(item);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCheck(HIDDEN + item.key, true);
  }

  /** A new amount for this week; null: back to what the recipes say (or one, when added by hand). */
  function setAmount(item: ShoppingItem, quantity: number | null) {
    const extra = extras.find((e) => e.id === item.extraId);
    if (extra) {
      if (!plan) return;
      const next = quantity && quantity !== 1 ? quantity : null;
      setExtras((prev) => prev.map((e) => (e.id === extra.id ? { ...e, quantity: next } : e)));
      changeShopping(plan.week_start, { type: 'quantity', extra, quantity: next });
      return;
    }
    const old = amounts.get(item.key);
    if (old) setCheck(old.check, false);
    if (quantity != null) setCheck(`${AMOUNT}${quantity}:${item.key}`, true);
  }

  function putBack(item: ShoppingItem) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCheck(HIDDEN + item.key, false);
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
      if (plan) await loadChecks();
      else await reload();
    } catch (e) {
      setExtraError(`Toevoegen lukte niet: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  function removeExtra(item: ShoppingItem) {
    const extra = extras.find((e) => e.id === item.extraId);
    if (!extra || !plan) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExtras((prev) => prev.filter((e) => e.id !== extra.id));
    changeShopping(plan.week_start, { type: 'remove', extra });
  }

  function share() {
    const sections = aisles.map(
      ({ aisle: a, items: list }) =>
        `*${a.label}*\n${list.map((i) => `• ${[formatAmount(i.quantity, i.unit), i.name].filter(Boolean).join(' ')}`).join('\n')}`,
    );
    Share.share({ message: `Boodschappen – ${weekLabel(weekStart).toLowerCase()}\n\n${sections.join('\n\n')}` });
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
          // The web ignores submitBehavior and leaves the field after Enter without this.
          blurOnSubmit={false}
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
      <Pressable
        onPress={() => router.push('/staples')}
        style={({ pressed }) => [styles.staplesButton, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="star" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.staplesTitle}>Vaste boodschappen</Text>
          <Text style={styles.staplesText}>
            {household?.staples.length
              ? 'Loop je vaste lijst langs: wat is er nodig deze week?'
              : 'Zet hier wat jullie vaak kopen, en loop het elke week langs'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardScreen>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <OfflineBanner savedAt={savedAt} />
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
                    {/* The date in its own column, so all dishes start at the same spot. */}
                    <View style={styles.mealRow}>
                      <Text style={styles.mealDate}>
                        {dayShort(weekStart, m.day)} {formatShort(dateOfDay(weekStart, m.day))}
                      </Text>
                      <Text style={styles.mealSeparator}>–</Text>
                      <Text style={styles.mealLine} numberOfLines={1}>
                        {m.recipe.title}
                      </Text>
                      <Text style={styles.mealServings}>{m.servings} pers.</Text>
                    </View>
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
              <View style={styles.headerActions}>
                <Pressable onPress={() => setEditingAisles(true)} hitSlop={8} style={styles.share}>
                  <Ionicons name="reorder-three-outline" size={18} color={colors.primaryDark} />
                  <Text style={styles.shareText}>Paden</Text>
                </Pressable>
                <Pressable onPress={share} hitSlop={8} style={styles.share}>
                  <Ionicons name="share-outline" size={18} color={colors.primaryDark} />
                  <Text style={styles.shareText}>Delen</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.moveHint}>
              Staat iets in het verkeerde pad? Tik op <Ionicons name="swap-vertical-outline" size={13} /> om het te verplaatsen.
            </Text>

            {aisles.map(({ aisle: a, items: list }) => (
              <View key={a.key} style={{ gap: spacing(2) }}>
                <View style={styles.aisleHeader}>
                  <Ionicons name={a.icon} size={16} color={colors.accent} />
                  <Text style={styles.aisleTitle}>{a.label}</Text>
                </View>
                <View style={styles.list}>
                  {list.map((item) => (
                    <Row
                      key={item.key}
                      item={item}
                      checked={false}
                      onPress={() => toggle(item)}
                      onMove={() => setMoving(item)}
                      onAmount={() => setChanging(item)}
                      onRemove={() => remove(item)}
                    />
                  ))}
                </View>
              </View>
            ))}

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
                      onRemove={() => remove(item)}
                    />
                  ))}
                </View>
              </>
            )}

            {hidden.length > 0 && (
              <View style={{ gap: spacing(2) }}>
                <Pressable onPress={() => setShowHidden(!showHidden)} hitSlop={6} style={styles.hiddenHeader}>
                  <Text style={styles.hiddenTitle}>Weggehaald deze week ({hidden.length})</Text>
                  <Ionicons name={showHidden ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </Pressable>
                {showHidden &&
                  hidden.map((item) => (
                    <View key={item.key} style={styles.hiddenRow}>
                      <Text style={styles.hiddenName} numberOfLines={1}>
                        {[formatAmount(item.quantity, item.unit), item.name].filter(Boolean).join(' ')}
                      </Text>
                      <Pressable onPress={() => putBack(item)} hitSlop={8} style={styles.putBack}>
                        <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.putBackText}>Terugzetten</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AmountDialog
        item={changing}
        onClose={() => setChanging(null)}
        onSave={(quantity) => changing && setAmount(changing, quantity)}
      />

      <AislePicker
        name={moving?.name ?? null}
        current={moving ? aisleOfItem(moving) : null}
        moved={!!moving && !!overrides[moving.name.trim().toLowerCase()]}
        aisles={shopAisles}
        onPick={(key) => {
          if (moving) moveTo(moving.name, key);
          setMoving(null);
        }}
        onNewAisle={(label) => {
          if (moving) moveToNewAisle(moving.name, label);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />

      <AisleEditor
        visible={editingAisles}
        onClose={() => setEditingAisles(false)}
        setup={setup}
        aisles={shopAisles}
        onSave={saveSetup}
      />
    </KeyboardScreen>
  );
}

const useNativeDriver = Platform.OS !== 'web';

// The week's dishes above the list: "wo 28 okt – Pasta pesto", with the dishes lined up.
const MEAL_DATE_W = 76;
const MEAL_SEPARATOR_W = 16;

/**
 * Ticking off: the check pops in and the item is struck through, then the row fades and slides
 * away before it moves to the other list (where the list closes the gap smoothly).
 */
function Row({
  item,
  checked,
  onPress,
  onMove,
  onAmount,
  onRemove,
}: {
  item: ShoppingItem;
  checked: boolean;
  onPress: () => void;
  /** Choose another aisle for the product. */
  onMove?: () => void;
  /** Change how many, for this week. */
  onAmount?: () => void;
  /** Off this week's list. */
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
          <View style={styles.nameRow}>
            {onAmount && (amount || item.extraId) ? (
              // Tap the amount to change it (still one mozzarella at home: 2 becomes 1).
              <Pressable
                onPress={onAmount}
                hitSlop={6}
                accessibilityLabel={`Aantal ${item.name} veranderen`}
                style={({ pressed }) => [
                  styles.amountChip,
                  item.planned != null && styles.amountChanged,
                  pressed && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.amount, item.planned != null && { color: colors.accent }]}>{amount || '1'}</Text>
              </Pressable>
            ) : amount ? (
              <Text style={[styles.amount, styles.itemName, showChecked && styles.checked]}>{amount}</Text>
            ) : null}
            <Text style={[styles.itemName, styles.nameText, showChecked && styles.checked]}>{item.name}</Text>
          </View>
          <Text style={styles.itemRecipes} numberOfLines={1}>
            {item.staple && item.staple !== item.name
              ? item.staple
              : item.staple
                ? 'Vaste boodschappen'
                : item.extraId
                  ? 'Zelf toegevoegd'
                  : item.recipes.join(', ')}
            {item.planned != null && ` · was ${formatAmount(item.planned, item.unit)}`}
          </Text>
        </View>
        {onMove && (
          <Pressable onPress={onMove} hitSlop={10} accessibilityLabel={`${item.name} in een ander gangpad zetten`}>
            <Ionicons name="swap-vertical-outline" size={20} color={colors.textMuted} />
          </Pressable>
        )}
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`${item.name} van het lijstje halen`}>
            <Ionicons name="close" size={18} color={colors.placeholder} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(10) },
  aisleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(1) },
  aisleTitle: { fontSize: 14, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealsBox: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing(4), gap: spacing(1.5) },
  mealRow: { flexDirection: 'row', alignItems: 'baseline' },
  mealDate: { width: MEAL_DATE_W, fontSize: 14, fontWeight: '700', color: colors.text },
  mealSeparator: { width: MEAL_SEPARATOR_W, fontSize: 14, color: colors.textMuted },
  mealLine: { flex: 1, minWidth: 0, fontSize: 14, color: colors.text },
  mealServings: { width: 52, textAlign: 'right', fontSize: 13, color: colors.textMuted },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(1),
    marginLeft: MEAL_DATE_W + MEAL_SEPARATOR_W,
    marginRight: 52,
    marginTop: 2,
  },
  note: { flex: 1, fontSize: 13, fontStyle: 'italic', color: colors.accent },
  addRow: { flexDirection: 'row', gap: spacing(2) },
  staplesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    marginTop: spacing(1),
  },
  staplesTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  staplesText: { fontSize: 13, color: colors.textMuted },
  addInput: {
    flex: 1,
    // On the web a text field won't shrink below its default width otherwise (narrow phones).
    minWidth: 0,
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
  headerActions: { flexDirection: 'row', gap: spacing(2) },
  moveHint: { fontSize: 13, color: colors.textMuted, marginTop: -spacing(1) },
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
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing(1.5) },
  nameText: { flexShrink: 1 },
  amountChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(1.5),
    paddingVertical: 1,
  },
  amountChanged: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  checked: { textDecorationLine: 'line-through', color: colors.textMuted },
  itemRecipes: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  doneTitle: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginTop: spacing(2) },
  hiddenHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: spacing(2) },
  hiddenTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(1) },
  hiddenName: { flex: 1, fontSize: 14, color: colors.textMuted, textDecorationLine: 'line-through' },
  putBack: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: spacing(1) },
  putBackText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
