import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dayShort } from '@/lib/dates';
import { memberColor, memberInitial } from '@/lib/members';
import { colors, radius, spacing } from '@/lib/theme';
import type { DayChoosers, Profile } from '@/lib/types';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The "who chooses when" block at the top of the week plan. It shows who chooses which day;
 * the pencil opens editing: tap a name to give the whole week to one person, or tap a few
 * days first and then a name to split the week. Days follow the rotation (`defaults`) until
 * they're changed, and with `onReset` they go back to it.
 */
export function ChooserPlanner({
  weekStart,
  choosers,
  defaults,
  members,
  meId,
  onAssign,
  onReset,
}: {
  weekStart: string;
  choosers: DayChoosers;
  /** Who chooses each day according to the rotation. */
  defaults?: DayChoosers;
  members: Profile[];
  meId?: string;
  onAssign: (days: number[], chooserId: string | null) => void;
  onReset?: (days: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  function toggleDay(day: number) {
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function assign(chooserId: string | null) {
    onAssign(selected.length ? selected : ALL_DAYS, chooserId);
    setSelected([]);
  }

  // Going back to the rotation is only offered when there is one and the week differs from it.
  const hasDefaults = !!defaults?.some((c) => c);
  const differs = (days: number[]) => !!defaults && days.some((d) => (choosers[d] ?? null) !== (defaults[d] ?? null));
  const canReset = !!onReset && hasDefaults && differs(selected.length ? selected : ALL_DAYS);

  function reset() {
    onReset?.(selected.length ? selected : ALL_DAYS);
    setSelected([]);
  }

  const counts = members
    .map((m) => ({ member: m, count: choosers.filter((c) => c === m.id).length }))
    .filter((c) => c.count > 0);
  const open = choosers.filter((c) => !c).length;

  const nameOf = (m: Profile) => (m.id === meId ? 'Jij' : m.display_name);
  const wholeWeek = counts.length === 1 && open === 0 ? counts[0].member : null;

  function finish() {
    setEditing(false);
    setSelected([]);
  }

  return (
    <View style={styles.box}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Wie kiest er?</Text>
          {onReset && hasDefaults && (
            <Text style={styles.source}>{differs(ALL_DAYS) ? 'Aangepast voor deze week' : 'Volgens de vaste volgorde'}</Text>
          )}
        </View>
        {editing ? (
          <Pressable onPress={finish} hitSlop={8} style={styles.done}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.doneText}>Klaar</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={10}
            style={styles.pencil}
            accessibilityLabel="Aanpassen wie er kiest"
          >
            <Ionicons name="pencil" size={16} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {!editing && (
        <View style={{ gap: spacing(1.5) }}>
          {wholeWeek ? (
            <View style={styles.line}>
              <View style={[styles.dot, { backgroundColor: memberColor(wholeWeek.id, members) }]} />
              <Text style={styles.lineText}>
                <Text style={styles.lineName}>{nameOf(wholeWeek)}</Text> kiest de hele week
              </Text>
            </View>
          ) : counts.length === 0 ? (
            <Text style={styles.lineText}>Nog niemand ingedeeld. Tik op het potlood om de week te verdelen.</Text>
          ) : (
            <>
              {counts.map(({ member }) => (
                <View key={member.id} style={styles.line}>
                  <View style={[styles.dot, { backgroundColor: memberColor(member.id, members) }]} />
                  <Text style={styles.lineText}>
                    <Text style={styles.lineName}>{nameOf(member)}</Text>:{' '}
                    {ALL_DAYS.filter((d) => choosers[d] === member.id)
                      .map((d) => dayShort(weekStart, d))
                      .join(', ')}
                  </Text>
                </View>
              ))}
              {open > 0 && (
                <View style={styles.line}>
                  <View style={[styles.dot, styles.dotOpen]} />
                  <Text style={[styles.lineText, { color: colors.textMuted }]}>
                    Nog open:{' '}
                    {ALL_DAYS.filter((d) => !choosers[d])
                      .map((d) => dayShort(weekStart, d))
                      .join(', ')}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {editing && (
        <>
          <View style={styles.days}>
            {ALL_DAYS.map((day) => {
              const chooser = choosers[day];
              const isSelected = selected.includes(day);
              return (
                <Pressable key={day} onPress={() => toggleDay(day)} style={styles.day} hitSlop={2}>
                  <Text style={[styles.dayLabel, isSelected && { color: colors.primaryDark, fontWeight: '800' }]}>
                    {dayShort(weekStart, day)}
                  </Text>
                  <View style={[styles.ring, isSelected && styles.ringSelected]}>
                    <View
                      style={[
                        styles.circle,
                        chooser ? { backgroundColor: memberColor(chooser, members) } : styles.circleEmpty,
                      ]}
                    >
                      <Text style={[styles.initial, !chooser && { color: colors.textMuted }]}>
                        {memberInitial(chooser, members)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.hint}>
            {selected.length
              ? `${selected.map((d) => dayShort(weekStart, d)).join(', ')} geven aan:`
              : 'Hele week voor één persoon, of tik eerst op een paar dagen:'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
            {members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => assign(m.id)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.dot, { backgroundColor: memberColor(m.id, members) }]} />
                <Text style={styles.chipText}>{m.id === meId ? `${m.display_name} (ik)` : m.display_name}</Text>
              </Pressable>
            ))}
            {selected.length > 0 && (
              <Pressable
                onPress={() => assign(null)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.chipText, { color: colors.textMuted }]}>Niemand</Text>
              </Pressable>
            )}
            {canReset && (
              <Pressable onPress={reset} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}>
                <Ionicons name="arrow-undo" size={14} color={colors.accent} />
                <Text style={[styles.chipText, { color: colors.accent }]}>Vaste volgorde</Text>
              </Pressable>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing(4), gap: spacing(3) },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2) },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  source: { fontSize: 12, color: colors.textMuted },
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
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  lineName: { fontWeight: '700' },
  dotOpen: { backgroundColor: colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9AAA0' },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: spacing(1), flex: 1 },
  dayLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  ring: { padding: 2, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  ringSelected: { borderColor: colors.primary },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  circleEmpty: { backgroundColor: colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9AAA0' },
  initial: { color: '#fff', fontWeight: '800', fontSize: 14 },
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
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
});
