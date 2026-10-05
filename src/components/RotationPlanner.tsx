import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DragHandle } from '@/components/DragHandle';
import { addWeeks, weekRange, weekStartOf } from '@/lib/dates';
import { memberColor } from '@/lib/members';
import { colors, radius, spacing } from '@/lib/theme';
import type { Profile } from '@/lib/types';

// Every row has the same height, so a member's position follows from its place in the list.
// The turn labels stay put; the names are a layer on top that you can drag up and down.
const ROW_H = 48;
const LABEL_W = 110;
// As in the week plan: the list re-renders while dragging, which would interrupt native-driver animations.
const useNativeDriver = false;

function turnLabel(index: number): string {
  if (index === 0) return 'Deze week';
  if (index === 1) return 'Volgende week';
  return `Over ${index} weken`;
}

/**
 * The fixed order of who chooses: one member per week, in turns. The list starts with whoever
 * chooses this week. Drag a name by its grip to change the order; the pencil opens editing to
 * add members or take them out.
 */
export function RotationPlanner({
  rotation,
  members,
  meId,
  onChange,
  onDragging,
}: {
  /** Member ids in turn order, starting with this week. */
  rotation: string[];
  members: Profile[];
  meId?: string;
  onChange: (rotation: string[]) => void;
  /** Lets the screen stop scrolling while a name is dragged. */
  onDragging?: (dragging: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  const nameOf = (id: string) => {
    if (id === meId) return 'Jij';
    return members.find((m) => m.id === id)?.display_name ?? '?';
  };
  const missing = members.filter((m) => !rotation.includes(m.id));

  // ---- Dragging ----
  // One position per name. Kept in state (not a ref) because the rows render from it.
  const [positions] = useState(() => new Map<string, Animated.Value>());
  const positionOf = (id: string, index: number) => {
    let value = positions.get(id);
    if (!value) {
      value = new Animated.Value(index * ROW_H);
      positions.set(id, value);
    }
    return value;
  };
  const slideTo = (id: string, index: number) => {
    const value = positions.get(id);
    if (value) Animated.spring(value, { toValue: index * ROW_H, friction: 8, tension: 90, useNativeDriver }).start();
  };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef({ id: null as string | null, from: 0, startY: 0, hover: 0 });

  // When the order changes (saved, or someone was added or taken out), slide every name to its place.
  const order = rotation.join();
  useEffect(() => {
    if (drag.current.id) return;
    rotation.forEach((id, index) => slideTo(id, index));
    // slideTo only reads the positions map, which never changes identity; `order` stands for `rotation`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  /** The order with the dragged name moved to place `to`. */
  function reordered(id: string, to: number) {
    const next = rotation.filter((r) => r !== id);
    next.splice(to, 0, id);
    return next;
  }

  function startDrag(id: string, pageY: number) {
    const from = rotation.indexOf(id);
    drag.current = { id, from, startY: pageY, hover: from };
    setDraggingId(id);
    onDragging?.(true);
  }

  function moveDrag(pageY: number) {
    const d = drag.current;
    if (!d.id) return;
    const y = Math.min((rotation.length - 1) * ROW_H, Math.max(0, d.from * ROW_H + pageY - d.startY));
    positions.get(d.id)?.setValue(y);
    const hover = Math.round(y / ROW_H);
    if (hover === d.hover) return;
    d.hover = hover;
    // The others make room.
    const dragged = d.id;
    reordered(dragged, hover).forEach((id, index) => {
      if (id !== dragged) slideTo(id, index);
    });
  }

  function endDrag(dropped: boolean) {
    const d = drag.current;
    if (!d.id) return;
    const to = dropped ? d.hover : d.from;
    const next = reordered(d.id, to);
    drag.current = { ...d, id: null };
    setDraggingId(null);
    onDragging?.(false);
    next.forEach((id, index) => slideTo(id, index));
    if (to !== d.from) onChange(next);
  }

  return (
    <View style={styles.box}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Vaste volgorde</Text>
        {editing ? (
          <Pressable onPress={() => setEditing(false)} hitSlop={8} style={styles.done}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.doneText}>Klaar</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={10}
            style={styles.pencil}
            accessibilityLabel="Vaste volgorde aanpassen"
          >
            <Ionicons name="pencil" size={16} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {rotation.length === 0 && !editing ? (
        <Text style={styles.text}>
          Om de beurt een week kiezen? Tik op het potlood en zet het gezin op volgorde: de eerste kiest deze week, de
          volgende volgende week, enzovoort.
        </Text>
      ) : (
        <View style={{ gap: spacing(2) }}>
          <View style={{ height: rotation.length * ROW_H }}>
            {/* Turn labels: fixed, one per week. Weeks run from the shopping day, so show their dates. */}
            {rotation.map((_id, index) => (
              <View key={index} style={[styles.turn, { top: index * ROW_H }]}>
                <Text style={styles.turnLabel}>{turnLabel(index)}</Text>
                <Text style={styles.turnDates}>{weekRange(addWeeks(weekStartOf(), index))}</Text>
              </View>
            ))}
            {/* Names: on top of the labels, each sliding to its own week. */}
            {rotation.map((id, index) => (
              <Animated.View
                key={id}
                style={[
                  styles.member,
                  draggingId === id && styles.memberLifted,
                  { transform: [{ translateY: positionOf(id, index) }] },
                ]}
              >
                {rotation.length > 1 && (
                  <DragHandle onStart={(y) => startDrag(id, y)} onMove={moveDrag} onEnd={endDrag} />
                )}
                <View style={[styles.dot, { backgroundColor: memberColor(id, members) }]} />
                <Text style={[styles.text, styles.name]} numberOfLines={1}>
                  {nameOf(id)}
                </Text>
                {editing && (
                  <Pressable
                    onPress={() => onChange(rotation.filter((r) => r !== id))}
                    hitSlop={4}
                    accessibilityLabel={`${nameOf(id)} uit de volgorde halen`}
                    style={({ pressed }) => [styles.remove, pressed && { opacity: 0.35 }]}
                  >
                    <Ionicons name="close" size={18} color={colors.text} />
                  </Pressable>
                )}
              </Animated.View>
            ))}
          </View>
          {rotation.length > 1 && (
            <Text style={styles.muted}>
              {editing ? '' : `Daarna begint het weer bij ${nameOf(rotation[0])}. `}
              Sleep een naam om de volgorde te veranderen.
            </Text>
          )}
        </View>
      )}

      {editing && missing.length > 0 && (
        <>
          <Text style={styles.hint}>Toevoegen aan de volgorde:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
            {missing.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => onChange([...rotation, m.id])}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add" size={14} color={colors.text} />
                <View style={[styles.dot, { backgroundColor: memberColor(m.id, members) }]} />
                <Text style={styles.chipText}>{m.id === meId ? `${m.display_name} (ik)` : m.display_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      {editing && (
        <Text style={styles.muted}>In het weekplan kun je een week of een paar dagen nog aan iemand anders geven.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing(4), gap: spacing(3) },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2) },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  pencil: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  turn: {
    position: 'absolute',
    left: 0,
    width: LABEL_W,
    height: ROW_H - 4,
    justifyContent: 'center',
  },
  turnLabel: { fontSize: 13, color: colors.text },
  turnDates: { fontSize: 12, color: colors.textMuted },
  member: {
    position: 'absolute',
    top: 0,
    left: LABEL_W,
    right: 0,
    height: ROW_H - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingRight: spacing(1),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  memberLifted: {
    zIndex: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: 15, color: colors.text, flexShrink: 1 },
  name: { flex: 1, fontWeight: '700' },
  muted: { fontSize: 13, color: colors.textMuted },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 13, color: colors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
});
