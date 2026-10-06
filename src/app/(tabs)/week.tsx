import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChooserPlanner } from '@/components/ChooserPlanner';
import { DragHandle } from '@/components/DragHandle';
import { RecipeImage } from '@/components/RecipeCard';
import { Loading, Stepper } from '@/components/ui';
import { WeekReady } from '@/components/WeekReady';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import { removeMeal, resetDayChoosers, setDayChoosers, swapDays, updateMealServings } from '@/lib/api';
import { dateOfDay, dayName, formatShort, todayIndex, weekStartOf } from '@/lib/dates';
import { confirm, notify } from '@/lib/dialogs';
import { memberColor, memberLabel, rotationChooser } from '@/lib/members';
import { useSelectedWeek, useWeekFromLink } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { isOwnDish, type WeekPlanMeal } from '@/lib/types';
import { useWeekPlan } from '@/lib/useWeekPlan';

// A day card grows with the number of dishes on that evening, so the position of every
// card and dish follows from the dishes per day (see weekLayout). The dish cards are a
// separate layer on top of the day cards, which lets them slide between days while you drag.
// The dishes of one evening belong together: dragging one moves the whole evening.
const BORDER = 2;
const PAD = 12;
const HEADER_H = 26;
const INNER_GAP = 8;
const CONTENT_H = 112;
const SLOT_GAP = 8;
const CARD_GAP = 12;
const CONTENT_TOP = BORDER + PAD + HEADER_H + INNER_GAP;

type WeekLayout = {
  /** Dishes per day, in the order they were added. */
  days: WeekPlanMeal[][];
  tops: number[];
  heights: number[];
  total: number;
  /** Position of every dish card. */
  slots: Map<string, number>;
};

function weekLayout(meals: WeekPlanMeal[]): WeekLayout {
  const days: WeekPlanMeal[][] = Array.from({ length: 7 }, () => []);
  for (const meal of [...meals].sort((a, b) => a.created_at.localeCompare(b.created_at))) days[meal.day].push(meal);
  const tops: number[] = [];
  const heights: number[] = [];
  const slots = new Map<string, number>();
  let y = 0;
  days.forEach((dayMeals, day) => {
    // An empty day keeps room for the "Kies een gerecht" button.
    const rows = Math.max(1, dayMeals.length);
    tops[day] = y;
    heights[day] = CONTENT_TOP + rows * CONTENT_H + (rows - 1) * SLOT_GAP + PAD + BORDER;
    dayMeals.forEach((meal, i) => slots.set(meal.id, y + CONTENT_TOP + i * (CONTENT_H + SLOT_GAP)));
    y += heights[day] + CARD_GAP;
  });
  return { days, tops, heights, total: y - CARD_GAP, slots };
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const EDGE = 80; // distance from the top/bottom edge where dragging scrolls the list
// The positions run on the JS driver: the screen re-renders while you drag (to light up the
// target day), and that re-render would interrupt animations running on the native driver.
const useNativeDriver = false;

export default function Week() {
  useWeekFromLink();
  const weekStart = useSelectedWeek();
  const { household, members, profile } = useSession();
  const { plan, meals, setMeals, chooserOverrides, setChooserOverrides, loading, error, reload } =
    useWeekPlan(weekStart);
  // Whoever's turn it is chooses the whole week, except on days changed for this week.
  const turn = rotationChooser(household, members, weekStart);
  const defaultChoosers = Array(7).fill(turn);
  const choosers = chooserOverrides.map((c) => (c === undefined ? turn : c));
  const [refreshing, setRefreshing] = useState(false);
  const layout = useMemo(() => weekLayout(meals), [meals]);

  // One position per dish card. Kept in state (not a ref) because the cards render from it.
  const [positions] = useState(() => new Map<string, Animated.Value>());
  const positionOf = (meal: WeekPlanMeal) => {
    let value = positions.get(meal.id);
    if (!value) {
      value = new Animated.Value(layout.slots.get(meal.id) ?? 0);
      positions.set(meal.id, value);
    }
    return value;
  };
  const slideTo = (mealId: string, y: number | undefined) => {
    const value = positions.get(mealId);
    if (value && y != null) Animated.spring(value, { toValue: y, friction: 8, tension: 90, useNativeDriver }).start();
  };

  // ---- Dragging ----
  const [draggingDay, setDraggingDay] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  const drag = useRef({
    listTop: 0,
    listHeight: 0,
    contentHeight: 0,
    cardsTop: 0,
    scrollY: 0,
    pageY: 0,
    /** The day being dragged, with each dish's distance to the finger. */
    from: null as number | null,
    offsets: [] as { id: string; offset: number }[],
    hover: null as number | null,
    layout: null as WeekLayout | null,
    timer: null as ReturnType<typeof setInterval> | null,
  });

  // When the dishes change (loaded, moved, another week), slide every card to its place.
  useEffect(() => {
    if (drag.current.from != null) return;
    for (const meal of meals) slideTo(meal.id, layout.slots.get(meal.id));
    // slideTo only reads the positions map, which never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => () => stopAutoScroll(), []);

  // The list fills this frame, so the frame's position on screen is the list's position.
  function measureList() {
    frameRef.current?.measureInWindow((_x, y, _w, h) => {
      drag.current.listTop = y;
      drag.current.listHeight = h;
    });
  }

  /** Finger position in the coordinates of the day cards. */
  function pointerY() {
    const d = drag.current;
    return d.pageY - d.listTop + d.scrollY - d.cardsTop;
  }

  function startDrag(day: number, pageY: number) {
    measureList();
    const d = drag.current;
    d.pageY = pageY;
    d.from = day;
    d.hover = day;
    d.layout = layout;
    const finger = pointerY();
    d.offsets = layout.days[day].map((m) => ({ id: m.id, offset: (layout.slots.get(m.id) ?? 0) - finger }));
    setDraggingDay(day);
    setHoverDay(day);
    stopAutoScroll();
    d.timer = setInterval(stepAutoScroll, 16);
  }

  function follow() {
    const d = drag.current;
    if (d.from == null || !d.layout || !d.offsets.length) return;
    const finger = pointerY();
    for (const { id, offset } of d.offsets) positions.get(id)?.setValue(finger + offset);
    // The day card under the middle of the dragged evening.
    const first = finger + d.offsets[0].offset;
    const last = finger + d.offsets[d.offsets.length - 1].offset + CONTENT_H;
    const middle = (first + last) / 2;
    const { tops } = d.layout;
    let day = 0;
    while (day < 6 && middle >= tops[day + 1] - CARD_GAP / 2) day++;
    if (day === d.hover) return;
    d.hover = day;
    setHoverDay(day);
  }

  function moveDrag(pageY: number) {
    drag.current.pageY = pageY;
    follow();
  }

  function stepAutoScroll() {
    const d = drag.current;
    let delta = 0;
    if (d.pageY < d.listTop + EDGE) delta = -10;
    else if (d.pageY > d.listTop + d.listHeight - EDGE) delta = 10;
    if (!delta) return;
    const max = Math.max(0, d.contentHeight - d.listHeight);
    const next = Math.min(max, Math.max(0, d.scrollY + delta));
    if (next === d.scrollY) return;
    d.scrollY = next;
    scrollRef.current?.scrollTo({ y: next, animated: false });
    follow();
  }

  function stopAutoScroll() {
    const d = drag.current;
    if (d.timer) clearInterval(d.timer);
    d.timer = null;
  }

  function endDrag(dropped: boolean) {
    stopAutoScroll();
    const d = drag.current;
    const from = d.from;
    const target = d.hover;
    d.from = null;
    setDraggingDay(null);
    setHoverDay(null);
    if (from == null) return;

    if (!dropped || target == null || target === from) {
      for (const { id } of d.offsets) slideTo(id, layout.slots.get(id));
      return;
    }
    swapEvenings(from, target);
  }

  /** Swaps all dishes of two evenings; the cards then slide to their new places. */
  async function swapEvenings(a: number, b: number) {
    if (!plan) return;
    setMeals((prev) => prev.map((m) => (m.day === a ? { ...m, day: b } : m.day === b ? { ...m, day: a } : m)));
    try {
      await swapDays(plan.id, a, b);
    } catch (e) {
      notify('Verplaatsen mislukt', (e as Error).message);
    }
    reload();
  }

  // ---- Other actions ----
  async function assignChoosers(days: number[], chooserId: string | null) {
    if (!household) return;
    setChooserOverrides((prev) => prev.map((c, day) => (days.includes(day) ? chooserId : c)));
    try {
      await setDayChoosers(household.id, weekStart, days, chooserId);
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
      reload();
    }
  }

  /** The given days follow the rotation from the family settings again. */
  async function resetChoosers(days: number[]) {
    setChooserOverrides((prev) => prev.map((c, day) => (days.includes(day) ? undefined : c)));
    try {
      await resetDayChoosers(weekStart, days);
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
      reload();
    }
  }

  async function changeServings(meal: WeekPlanMeal, servings: number) {
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, servings } : m)));
    try {
      await updateMealServings(meal.id, servings);
    } catch {
      reload();
    }
  }

  async function confirmRemove(meal: WeekPlanMeal) {
    const message = `${meal.recipe.title} van ${dayName(weekStart, meal.day).toLowerCase()} halen?`;
    if (!(await confirm('Gerecht weghalen?', message, 'Weghalen', true))) return;
    try {
      await removeMeal(meal.id);
    } catch (e) {
      notify('Weghalen mislukt', (e as Error).message);
    }
    reload();
  }

  /** Choose a dish for the day, or with `replacing`, another dish in its place. */
  function pick(day: number, replacing?: WeekPlanMeal) {
    router.push({
      pathname: '/pick-recipe',
      params: replacing
        ? { weekStart, day: String(day), mealId: replacing.id, servings: String(replacing.servings) }
        : { weekStart, day: String(day) },
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  if (loading) return <Loading />;

  const isCurrentWeek = weekStart === weekStartOf();

  return (
    <View ref={frameRef} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={draggingDay == null}
        onLayout={measureList}
        onContentSizeChange={(_w, h) => (drag.current.contentHeight = h)}
        onScroll={(e) => (drag.current.scrollY = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <WeekSwitcher weekStart={weekStart} />
        <ChooserPlanner
          weekStart={weekStart}
          choosers={choosers}
          defaults={defaultChoosers}
          members={members}
          meId={profile?.id}
          onAssign={assignChoosers}
          onReset={resetChoosers}
        />
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {meals.length > 1 && (
          <Text style={styles.dragHint}>
            Houd <Ionicons name="reorder-three" size={14} color={colors.textMuted} /> vast en sleep een gerecht naar een
            andere dag om te wisselen. Gerechten van dezelfde avond gaan samen mee.
          </Text>
        )}

        <View
          style={{ height: layout.total }}
          onLayout={(e) => (drag.current.cardsTop = e.nativeEvent.layout.y)}
        >
          {/* Day cards: fixed slots with the day, date and who chooses. */}
          {DAYS.map((day) => {
            const name = dayName(weekStart, day);
            const isToday = isCurrentWeek && day === todayIndex();
            const chooser = choosers[day];
            const chooserName = memberLabel(chooser, members, profile?.id);
            const isTarget = draggingDay != null && hoverDay === day && day !== draggingDay;
            const hasMeals = layout.days[day].length > 0;
            return (
              <View
                key={day}
                style={[
                  styles.day,
                  { top: layout.tops[day], height: layout.heights[day] },
                  isToday && styles.today,
                  isTarget && styles.target,
                ]}
              >
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{name}</Text>
                  <Text style={styles.dayDate}>
                    {isToday ? 'Vandaag · ' : ''}
                    {formatShort(dateOfDay(weekStart, day))}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {chooserName && (
                    <View style={styles.badge}>
                      <View style={[styles.dot, { backgroundColor: memberColor(chooser, members) }]} />
                      <Text style={styles.badgeText}>{chooserName} kiest</Text>
                    </View>
                  )}
                  {hasMeals && (
                    <Pressable
                      onPress={() => pick(day)}
                      disabled={draggingDay != null}
                      hitSlop={8}
                      style={({ pressed }) => [styles.addMore, pressed && { opacity: 0.5 }]}
                      accessibilityLabel={`Nog een gerecht op ${name.toLowerCase()}`}
                    >
                      <Ionicons name="add" size={16} color={colors.primaryDark} />
                      <Text style={styles.addMoreText}>Erbij</Text>
                    </Pressable>
                  )}
                </View>
                {!hasMeals && (
                  <View style={styles.slot}>
                    <Pressable style={styles.empty} onPress={() => pick(day)} disabled={draggingDay != null}>
                      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                      <Text style={styles.emptyText}>Kies een gerecht</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          {/* Dish cards: on top of the day cards, each sliding to its own day. */}
          {meals.map((meal) => {
            const isDragged = meal.day === draggingDay;
            return (
              <Animated.View
                key={meal.id}
                style={[
                  styles.meal,
                  isDragged && styles.mealLifted,
                  { transform: [{ translateY: positionOf(meal) }, { scale: isDragged ? 1.03 : 1 }] },
                ]}
              >
                <View style={styles.mealRow}>
                  <DragHandle onStart={(y) => startDrag(meal.day, y)} onMove={moveDrag} onEnd={endDrag} />
                  <Pressable
                    style={styles.mealMain}
                    disabled={draggingDay != null}
                    onPress={() =>
                      meal.recipe_id == null
                        ? router.push({
                            pathname: '/compose-avg',
                            params: { weekStart, day: String(meal.day), mealId: meal.id },
                          })
                        : router.push({
                            pathname: '/recipe/[id]',
                            params: { id: meal.recipe_id, servings: String(meal.servings), mealId: meal.id, weekStart },
                          })
                    }
                  >
                    <View style={{ width: 56 }}>
                      <RecipeImage uri={meal.recipe.image_url} height={56} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.mealTitle} numberOfLines={!isOwnDish(meal) && (meal.note || meal.custom_ingredients) ? 1 : 2}>
                        {meal.recipe.title}
                      </Text>
                      {isOwnDish(meal) ? (
                        <Text style={styles.mealMeta}>AVG</Text>
                      ) : meal.note || meal.custom_ingredients ? (
                        <View style={styles.adjusted}>
                          <Ionicons name="create" size={13} color={colors.primaryDark} />
                          <Text style={styles.adjustedText} numberOfLines={1}>
                            {meal.note ?? 'Aangepast voor deze avond'}
                          </Text>
                        </View>
                      ) : (
                        meal.recipe.prep_minutes != null && (
                          <Text style={styles.mealMeta}>{meal.recipe.prep_minutes} min</Text>
                        )
                      )}
                    </View>
                  </Pressable>
                </View>
                <View style={styles.mealActions}>
                  <Stepper value={meal.servings} onChange={(v) => changeServings(meal, v)} suffix="pers." />
                  <View style={styles.icons}>
                    <IconButton
                      icon="create-outline"
                      label="Aanpassen"
                      onPress={() =>
                        // An AVG is changed in the same screen it was put together in.
                        isOwnDish(meal)
                          ? router.push({
                              pathname: '/compose-avg',
                              params: { weekStart, day: String(meal.day), mealId: meal.id },
                            })
                          : router.push({ pathname: '/adjust-meal', params: { weekStart, mealId: meal.id } })
                      }
                    />
                    <IconButton icon="refresh" label="Ander" onPress={() => pick(meal.day, meal)} />
                    <IconButton icon="trash-outline" label="Weg" onPress={() => confirmRemove(meal)} />
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>

        <WeekReady weekStart={weekStart} plan={plan} hasMeals={meals.length > 0} onChange={reload} />
      </ScrollView>
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: 'create-outline' | 'refresh' | 'trash-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={styles.iconLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(10) },
  dragHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  day: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: PAD,
    borderWidth: BORDER,
    borderColor: colors.border,
  },
  today: { borderColor: colors.primary },
  target: { borderColor: colors.accent, borderStyle: 'dashed', backgroundColor: colors.accentSoft },
  dayHeader: { height: HEADER_H, flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  dayName: { fontSize: 16, fontWeight: '800', color: colors.text },
  dayDate: { fontSize: 13, color: colors.textMuted },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  addMoreText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  slot: { marginTop: INNER_GAP, height: CONTENT_H, justifyContent: 'center' },
  meal: {
    position: 'absolute',
    top: 0,
    left: BORDER + PAD,
    right: BORDER + PAD,
    height: CONTENT_H,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  mealLifted: {
    zIndex: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing(1),
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  mealMain: { flex: 1, flexDirection: 'row', gap: spacing(3), alignItems: 'center' },
  mealTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  mealMeta: { fontSize: 13, color: colors.textMuted },
  adjusted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
  },
  adjustedText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark, flexShrink: 1 },
  mealActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icons: { flexDirection: 'row', gap: spacing(1) },
  iconButton: { alignItems: 'center', gap: 1, minWidth: 48 },
  iconLabel: { fontSize: 10, color: colors.textMuted },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  emptyText: { color: colors.primaryDark, fontWeight: '600', fontSize: 15 },
});
