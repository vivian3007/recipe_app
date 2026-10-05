import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChooserPlanner } from '@/components/ChooserPlanner';
import { DragHandle } from '@/components/DragHandle';
import { RecipeImage } from '@/components/RecipeCard';
import { Loading, Stepper } from '@/components/ui';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import { moveMeal, removeMeal, setDayChoosers, updateMealServings } from '@/lib/api';
import { DAY_NAMES, dateOfDay, formatShort, todayIndex, weekStartOf } from '@/lib/dates';
import { memberColor, memberLabel } from '@/lib/members';
import { useSelectedWeek } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { WeekPlanMeal } from '@/lib/types';
import { useWeekPlan } from '@/lib/useWeekPlan';

// Every day card has the same height, so each dish's position follows from its day.
// The dish cards are a separate layer on top of the day cards, which lets them slide
// between days while you drag.
const BORDER = 2;
const PAD = 12;
const HEADER_H = 26;
const INNER_GAP = 8;
const CONTENT_H = 112;
const CARD_H = BORDER * 2 + PAD * 2 + HEADER_H + INNER_GAP + CONTENT_H;
const CARD_GAP = 12;
const CONTENT_TOP = BORDER + PAD + HEADER_H + INNER_GAP;
const slotY = (day: number) => day * (CARD_H + CARD_GAP) + CONTENT_TOP;

const EDGE = 80; // distance from the top/bottom edge where dragging scrolls the list
// The positions run on the JS driver: the screen re-renders while you drag (to light up the
// target day), and that re-render would interrupt animations running on the native driver.
const useNativeDriver = false;

export default function Week() {
  const weekStart = useSelectedWeek();
  const { household, members, profile } = useSession();
  const { meals, setMeals, choosers, setChoosers, loading, error, reload } = useWeekPlan(weekStart);
  const [refreshing, setRefreshing] = useState(false);

  // One position per dish card. Kept in state (not a ref) because the cards render from it.
  const [positions] = useState(() => new Map<string, Animated.Value>());
  const positionOf = (meal: WeekPlanMeal) => {
    let value = positions.get(meal.id);
    if (!value) {
      value = new Animated.Value(slotY(meal.day));
      positions.set(meal.id, value);
    }
    return value;
  };
  const slideTo = (mealId: string, day: number) => {
    const value = positions.get(mealId);
    if (value) Animated.spring(value, { toValue: slotY(day), friction: 8, tension: 90, useNativeDriver }).start();
  };

  // ---- Dragging ----
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    grabOffset: 0,
    meal: null as WeekPlanMeal | null,
    hover: null as number | null,
    others: [] as WeekPlanMeal[],
    timer: null as ReturnType<typeof setInterval> | null,
  });

  // When the dishes change (loaded, moved, another week), slide every card to its day.
  useEffect(() => {
    if (drag.current.meal) return;
    for (const meal of meals) slideTo(meal.id, meal.day);
    // slideTo only reads the positions map, which never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals]);

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

  function startDrag(meal: WeekPlanMeal, pageY: number) {
    measureList();
    const d = drag.current;
    d.pageY = pageY;
    d.meal = meal;
    d.hover = meal.day;
    d.others = meals.filter((m) => m.id !== meal.id);
    d.grabOffset = pointerY() - slotY(meal.day);
    setDraggingId(meal.id);
    setHoverDay(meal.day);
    stopAutoScroll();
    d.timer = setInterval(stepAutoScroll, 16);
  }

  function follow() {
    const d = drag.current;
    if (!d.meal) return;
    const y = pointerY() - d.grabOffset;
    positions.get(d.meal.id)?.setValue(y);
    // The day whose slot is closest to the dragged card's position.
    const day = Math.min(6, Math.max(0, Math.round((y - CONTENT_TOP) / (CARD_H + CARD_GAP))));
    if (day === d.hover) return;
    const source = d.meal.day;
    // The dish that was making room goes back; the dish on the new day slides into the gap.
    const previous = d.others.find((m) => m.day === d.hover);
    if (previous) slideTo(previous.id, previous.day);
    const next = d.others.find((m) => m.day === day);
    if (next) slideTo(next.id, source);
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
    const meal = d.meal;
    const target = d.hover;
    d.meal = null;
    setDraggingId(null);
    setHoverDay(null);
    if (!meal) return;

    if (!dropped || target == null || target === meal.day) {
      // Put everything back where it was.
      slideTo(meal.id, meal.day);
      for (const m of d.others) slideTo(m.id, m.day);
      return;
    }
    slideTo(meal.id, target);
    moveTo(meal, target);
  }

  async function moveTo(meal: WeekPlanMeal, day: number) {
    setMeals((prev) =>
      prev.map((m) => (m.id === meal.id ? { ...m, day } : m.day === day ? { ...m, day: meal.day } : m)),
    );
    try {
      await moveMeal(meal.id, day);
    } catch (e) {
      Alert.alert('Verplaatsen mislukt', (e as Error).message);
    }
    reload();
  }

  // ---- Other actions ----
  async function assignChoosers(days: number[], chooserId: string | null) {
    if (!household) return;
    setChoosers((prev) => prev.map((c, day) => (days.includes(day) ? chooserId : c)));
    try {
      await setDayChoosers(household.id, weekStart, days, chooserId);
    } catch (e) {
      Alert.alert('Opslaan mislukt', (e as Error).message);
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

  function confirmRemove(meal: WeekPlanMeal) {
    Alert.alert('Gerecht weghalen?', `${meal.recipe.title} van ${DAY_NAMES[meal.day].toLowerCase()} halen?`, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Weghalen',
        style: 'destructive',
        onPress: async () => {
          await removeMeal(meal.id);
          reload();
        },
      },
    ]);
  }

  function pick(day: number) {
    router.push({ pathname: '/pick-recipe', params: { weekStart, day: String(day) } });
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  if (loading) return <Loading />;

  const isCurrentWeek = weekStart === weekStartOf();
  const mealDays = new Set(meals.map((m) => m.day));
  const draggedDay = meals.find((m) => m.id === draggingId)?.day;

  return (
    <View ref={frameRef} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!draggingId}
        onLayout={measureList}
        onContentSizeChange={(_w, h) => (drag.current.contentHeight = h)}
        onScroll={(e) => (drag.current.scrollY = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <WeekSwitcher weekStart={weekStart} />
        <ChooserPlanner choosers={choosers} members={members} meId={profile?.id} onAssign={assignChoosers} />
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {meals.length > 1 && (
          <Text style={styles.dragHint}>
            Houd <Ionicons name="reorder-three" size={14} color={colors.textMuted} /> vast en sleep een gerecht naar een
            andere dag om te wisselen.
          </Text>
        )}

        <View
          style={{ height: 7 * CARD_H + 6 * CARD_GAP }}
          onLayout={(e) => (drag.current.cardsTop = e.nativeEvent.layout.y)}
        >
          {/* Day cards: fixed slots with the day, date and who chooses. */}
          {DAY_NAMES.map((dayName, day) => {
            const isToday = isCurrentWeek && day === todayIndex();
            const chooser = choosers[day];
            const chooserName = memberLabel(chooser, members, profile?.id);
            const isTarget = draggingId != null && hoverDay === day && day !== draggedDay;
            return (
              <View
                key={day}
                style={[
                  styles.day,
                  { top: day * (CARD_H + CARD_GAP) },
                  isToday && styles.today,
                  isTarget && styles.target,
                ]}
              >
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{dayName}</Text>
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
                </View>
                <View style={styles.slot}>
                  {!mealDays.has(day) && (
                    <Pressable style={styles.empty} onPress={() => pick(day)} disabled={!!draggingId}>
                      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                      <Text style={styles.emptyText}>Kies een gerecht</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          {/* Dish cards: on top of the day cards, each sliding to its own day. */}
          {meals.map((meal) => {
            const isDragged = meal.id === draggingId;
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
                  <DragHandle onStart={(y) => startDrag(meal, y)} onMove={moveDrag} onEnd={endDrag} />
                  <Pressable
                    style={styles.mealMain}
                    disabled={!!draggingId}
                    onPress={() =>
                      router.push({
                        pathname: '/recipe/[id]',
                        params: { id: meal.recipe_id, servings: String(meal.servings), mealId: meal.id, weekStart },
                      })
                    }
                  >
                    <View style={{ width: 56 }}>
                      <RecipeImage uri={meal.recipe.image_url} height={56} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.mealTitle} numberOfLines={meal.note || meal.custom_ingredients ? 1 : 2}>
                        {meal.recipe.title}
                      </Text>
                      {meal.note || meal.custom_ingredients ? (
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
                        router.push({ pathname: '/adjust-meal', params: { weekStart, mealId: meal.id } })
                      }
                    />
                    <IconButton icon="refresh" label="Ander" onPress={() => pick(meal.day)} />
                    <IconButton icon="trash-outline" label="Weg" onPress={() => confirmRemove(meal)} />
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
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
    height: CARD_H,
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
