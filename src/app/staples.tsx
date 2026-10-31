import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AisleEditor } from '@/components/AisleEditor';
import { AislePicker } from '@/components/AislePicker';
import { AddStapleDialog, KindsDialog, PasteListDialog, StapleDialog, Stepper } from '@/components/StapleDialogs';
import { Button, EmptyState, Loading, type IconName } from '@/components/ui';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import { addShoppingExtra, listShoppingExtras, removeShoppingExtra, saveStaples, setStapleSkipped } from '@/lib/api';
import { aisleOf } from '@/lib/aisles';
import { notify } from '@/lib/dialogs';
import { useSelectedWeek } from '@/lib/selectedWeek';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { ShoppingExtra, Staple } from '@/lib/types';
import { useAisles } from '@/lib/useAisles';
import { useWeekPlan } from '@/lib/useWeekPlan';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A pasted list: one product per line, without bullets, empty lines or doubles. */
function parseList(text: string, existing: Staple[]): Staple[] {
  const seen = new Set(existing.map((s) => s.name.toLowerCase()));
  const added: Staple[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/^\s*[-•*–]\s*/, '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    added.push({ id: newId(), name });
  }
  return added;
}

/** What's on the shopping list from one staple: "2×", or "2 rooibos, munt" for kinds. */
function onListText(staple: Staple, added: ShoppingExtra[]) {
  const parts = added
    .map((e) =>
      e.name === staple.name ? (e.quantity ? `${e.quantity}×` : '') : [e.quantity, e.name].filter(Boolean).join(' '),
    )
    .filter(Boolean);
  return parts.length ? `Op het lijstje: ${parts.join(', ')}` : 'Op het boodschappenlijstje';
}

/**
 * Vaste boodschappen: products the family buys often. Every week you go through them, per aisle:
 * Nodig (it goes on the shopping list, as many as you set) or Niet nodig. For a product that's
 * different every week (Thee, Vleeswaren) Nodig asks which kind. What you've been through moves
 * down to Bekeken, so the list gets shorter. Tapping a name changes it or its aisle.
 */
export default function Staples() {
  const weekStart = useSelectedWeek();
  const { household, profile, refresh } = useSession();
  const { aisles, setup, overrides, moveTo, saveSetup, moveToNewAisle } = useAisles();
  const { plan, loading, reload } = useWeekPlan(weekStart);
  const [extras, setExtras] = useState<ShoppingExtra[]>([]);
  // Taps show straight away, also while saving.
  const [skipDraft, setSkipDraft] = useState<Record<string, boolean>>({});
  const [addingIds, setAddingIds] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(true);
  const [listDraft, setListDraft] = useState<Staple[] | null>(null);
  const [dialog, setDialog] = useState<'add' | 'paste' | null>(null);
  // The product whose name was tapped (rename, ask for the kind, aisle, or take off the list).
  const [selected, setSelected] = useState<Staple | null>(null);
  // The product whose aisle is being chosen, and the one whose kinds are being chosen.
  const [moving, setMoving] = useState<Staple | null>(null);
  const [choosingKinds, setChoosingKinds] = useState<Staple | null>(null);
  const [editingAisles, setEditingAisles] = useState(false);
  // How many of a product, set before Nodig.
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  // What the last paste did, shown under the buttons.
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  const staples = listDraft ?? household?.staples ?? [];
  const aisleOfStaple = (s: Staple) => aisleOf(s.name, overrides, aisles);

  const loadExtras = useCallback(async () => {
    setExtras(plan ? await listShoppingExtras(plan.id) : []);
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      loadExtras();
    }, [loadExtras]),
  );

  if (loading || !household) return <Loading />;

  const skipped = (id: string) => skipDraft[id] ?? (plan?.staples_skipped ?? []).includes(id);
  const onList = (id: string) => addingIds.includes(id) || extras.some((e) => e.staple_id === id);
  const isDone = (s: Staple) => onList(s.id) || skipped(s.id);

  // Per aisle in the family's order, like the shopping list; alphabetical within an aisle.
  const groups = aisles
    .map((a) => ({
      aisle: a,
      items: staples
        .filter((s) => aisleOfStaple(s) === a.key)
        .sort((x, y) => x.name.localeCompare(y.name, 'nl')),
    }))
    .filter((g) => g.items.length > 0);
  const openGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((s) => !isDone(s)) }))
    .filter((g) => g.items.length > 0);
  const done = groups.flatMap((g) => g.items).filter(isDone);
  const toCheck = staples.length - done.length;

  /** Nodig: on the shopping list, as many as set. Thee, Vleeswaren etc. ask which kind first. */
  function needed(staple: Staple) {
    if (staple.askKind) setChoosingKinds(staple);
    else add(staple, [{ name: staple.name, quantity: amounts[staple.id] ?? 1 }]);
  }

  async function add(staple: Staple, lines: { name: string; quantity: number }[]) {
    if (!household || !profile) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAddingIds((ids) => [...ids, staple.id]);
    setAmounts(({ [staple.id]: _, ...rest }) => rest);
    try {
      for (const line of lines) {
        await addShoppingExtra(household.id, weekStart, profile.id, line.name, staple.id, line.quantity);
      }
      if (skipped(staple.id)) await setStapleSkipped(household.id, weekStart, staple.id, false);
      if (plan) await loadExtras();
      else await reload();
    } catch (e) {
      notify('Toevoegen mislukt', (e as Error).message);
    } finally {
      setAddingIds((ids) => ids.filter((id) => id !== staple.id));
    }
  }

  async function setSkip(staple: Staple, next: boolean) {
    if (!household) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSkipDraft((d) => ({ ...d, [staple.id]: next }));
    try {
      await setStapleSkipped(household.id, weekStart, staple.id, next);
      await reload();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setSkipDraft(({ [staple.id]: _, ...rest }) => rest);
    }
  }

  /** Back to "nog te bekijken": takes it off the shopping list again, or undoes "niet nodig". */
  async function undo(staple: Staple) {
    const added = extras.filter((e) => e.staple_id === staple.id);
    if (added.length === 0) return setSkip(staple, false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExtras((list) => list.filter((e) => e.staple_id !== staple.id));
    try {
      for (const extra of added) await removeShoppingExtra(extra);
    } catch (e) {
      notify('Ongedaan maken mislukt', (e as Error).message);
    }
    await loadExtras();
  }

  async function saveList(next: Staple[]) {
    if (!household) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setListDraft(next);
    try {
      await saveStaples(household.id, next);
      await refresh();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setListDraft(null);
    }
  }

  function addPasted(text: string) {
    const added = parseList(text, staples);
    if (added.length > 0) saveList([...staples, ...added]);
    setPasteResult(
      added.length === 0
        ? 'Alles stond er al op.'
        : `${added.length} ${added.length === 1 ? 'product' : 'producten'} op de vaste lijst gezet.`,
    );
  }

  /** From the "Product toevoegen" dialog; false when it was already on the list. */
  function addOne(name: string) {
    const added = parseList(name, staples);
    if (added.length > 0) saveList([...staples, ...added]);
    return added.length > 0;
  }

  const listButtons = (
    <>
      <View style={styles.listButtons}>
        <Pill icon="add" label="Product toevoegen" onPress={() => setDialog('add')} />
        <Pill
          icon="clipboard-outline"
          label="Lijst plakken"
          onPress={() => {
            setPasteResult(null);
            setDialog('paste');
          }}
        />
        {staples.length > 0 && (
          <Pill icon="reorder-three-outline" label="Paden" onPress={() => setEditingAisles(true)} />
        )}
      </View>
      {pasteResult && <Text style={styles.pasteResult}>{pasteResult}</Text>}
      <AddStapleDialog visible={dialog === 'add'} onClose={() => setDialog(null)} onAdd={addOne} />
      <PasteListDialog visible={dialog === 'paste'} onClose={() => setDialog(null)} onPaste={addPasted} />
      <StapleDialog
        staple={selected}
        aisleLabel={(selected && aisles.find((a) => a.key === aisleOfStaple(selected))?.label) ?? ''}
        onClose={() => setSelected(null)}
        onSave={(next) => saveList(staples.map((s) => (s.id === next.id ? next : s)))}
        onMoveAisle={() => {
          setMoving(selected);
          setSelected(null);
        }}
        onRemove={() => {
          if (selected) saveList(staples.filter((s) => s.id !== selected.id));
          setSelected(null);
        }}
      />
      <KindsDialog
        staple={choosingKinds}
        onClose={() => setChoosingKinds(null)}
        onConfirm={(lines) => {
          if (choosingKinds) add(choosingKinds, lines);
          setChoosingKinds(null);
        }}
      />
      <AislePicker
        name={moving?.name ?? null}
        current={moving ? aisleOfStaple(moving) : null}
        moved={!!moving && !!overrides[moving.name.trim().toLowerCase()]}
        aisles={aisles}
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
        aisles={aisles}
        onSave={saveSetup}
      />
    </>
  );

  if (staples.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <EmptyState
          icon="star-outline"
          title="Nog geen vaste boodschappen"
          text="Zet hier de producten op die jullie vaak kopen. Dan loop je ze elke week even langs: nodig of niet?"
        />
        {listButtons}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* The same week as on Boodschappen: switch to next week to get its shopping ready. */}
      <WeekSwitcher weekStart={weekStart} />
      <View>
        <Text style={styles.count}>{toCheck === 0 ? 'Alles bekeken' : `Nog ${toCheck} te bekijken`}</Text>
        <Text style={styles.week}>{staples.length} vaste boodschappen</Text>
      </View>

      {listButtons}

      {toCheck > 0 ? (
        <Text style={styles.hint}>
          Tik op een naam om die te veranderen of in een ander pad te zetten. Elke week een andere soort, zoals bij
          thee? Zet daar dan Soort kiezen aan.
        </Text>
      ) : (
        <View style={styles.allDone}>
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          <Text style={styles.allDoneText}>Je hebt alles bekeken.</Text>
          <Button title="Naar boodschappen" variant="secondary" onPress={() => router.back()} />
        </View>
      )}

      {openGroups.map(({ aisle: a, items }) => (
        <View key={a.key} style={{ gap: spacing(2) }}>
          <AisleTitle icon={a.icon} label={a.label} />
          <View style={styles.list}>
            {items.map((staple) => (
              <View key={staple.id} style={styles.item}>
                {/* The amount sits under the name, so the name keeps its room on a phone. */}
                <View style={styles.nameButton}>
                  <Pressable onPress={() => setSelected(staple)} hitSlop={4}>
                    <Text style={styles.name}>{staple.name}</Text>
                  </Pressable>
                  {!staple.askKind && (
                    <View style={styles.amount}>
                      <Stepper
                        value={amounts[staple.id] ?? 1}
                        onChange={(n) => setAmounts((a) => ({ ...a, [staple.id]: n }))}
                        label={staple.name}
                      />
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={() => needed(staple)}
                  accessibilityLabel={`${staple.name} is nodig`}
                  style={({ pressed }) => [styles.needed, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={styles.neededText}>Nodig</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSkip(staple, true)}
                  accessibilityLabel={`${staple.name} is niet nodig`}
                  style={({ pressed }) => [styles.notNeeded, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.notNeededText}>Niet nodig</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}

      {done.length > 0 && (
        <View style={{ gap: spacing(2) }}>
          <Pressable onPress={() => setShowDone(!showDone)} style={styles.doneHeader} hitSlop={6}>
            <Text style={styles.doneTitle}>Bekeken ({done.length})</Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </Pressable>
          {showDone && (
            <View style={styles.list}>
              {done.map((staple) => {
                const added = onList(staple.id);
                return (
                  <View key={staple.id} style={styles.item}>
                    <Ionicons
                      name={added ? 'checkmark-circle' : 'remove-circle-outline'}
                      size={20}
                      color={added ? colors.accent : colors.placeholder}
                    />
                    <Pressable onPress={() => setSelected(staple)} style={styles.nameButton} hitSlop={4}>
                      <Text style={[styles.name, !added && { color: colors.textMuted }]}>{staple.name}</Text>
                      <Text style={styles.sub}>
                        {added
                          ? onListText(
                              staple,
                              extras.filter((e) => e.staple_id === staple.id),
                            )
                          : 'Niet nodig'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => undo(staple)}
                      hitSlop={6}
                      accessibilityLabel={`${staple.name} ongedaan maken`}
                      style={({ pressed }) => [styles.undo, pressed && { opacity: 0.5 }]}
                    >
                      <Ionicons name="arrow-undo-outline" size={15} color={colors.textMuted} />
                      <Text style={styles.undoText}>Ongedaan</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function AisleTitle({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.aisleHeader}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={styles.aisleTitle}>{label}</Text>
    </View>
  );
}

function Pill({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={16} color={colors.primaryDark} />
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(10) },
  count: { fontSize: 18, fontWeight: '800', color: colors.text },
  week: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 13, color: colors.textMuted },
  listButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  pillText: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  pasteResult: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing(2),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing(3),
  },
  allDoneText: { flex: 1, minWidth: 160, fontSize: 15, fontWeight: '600', color: colors.accent },
  aisleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(1) },
  aisleTitle: { fontSize: 14, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameButton: { flex: 1, minWidth: 0 },
  amount: { flexDirection: 'row', marginTop: spacing(1) },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  needed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
  },
  neededText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  notNeeded: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
  },
  notNeededText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  doneHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: spacing(2) },
  doneTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing(1), paddingVertical: spacing(1) },
  undoText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
