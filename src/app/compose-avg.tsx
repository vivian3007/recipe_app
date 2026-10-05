import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, Chip, Loading, Stepper } from '@/components/ui';
import { addOwnDish, getWeekPlan, saveAvgOptions, updateOwnDish } from '@/lib/api';
import { avgGroups, avgTitle, findAvgOption, type AvgGroup } from '@/lib/avg';
import { dateOfDay, dayName, formatShort } from '@/lib/dates';
import { confirm, notify } from '@/lib/dialogs';
import { formatQuantity, parseQuantity } from '@/lib/quantities';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { DEFAULT_SERVINGS, isOwnDish, type Ingredient, type OwnAvgOption } from '@/lib/types';

/** One line of the dish: a chosen option, or an ingredient of a saved AVG that is no longer a choice. */
type Line = { key: string; name: string; unit: string | null; perPerson: number | null };

/**
 * Put together an AVG (aardappels, groente, vlees) without making a recipe: pick what you eat,
 * and the amounts for everyone go on the shopping list. With mealId it changes that dish:
 * an AVG is opened as it was, a recipe dish is replaced by the AVG.
 */
export default function ComposeAvg() {
  const {
    weekStart,
    day: dayParam,
    mealId,
    servings: servingsParam,
  } = useLocalSearchParams<{ weekStart: string; day: string; mealId?: string; servings?: string }>();
  const day = Number(dayParam);
  const { household, refresh } = useSession();
  const [loading, setLoading] = useState(!!mealId);
  const [saving, setSaving] = useState(false);
  const [servings, setServings] = useState(servingsParam ? Number(servingsParam) : DEFAULT_SERVINGS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Ingredients of the planned AVG that aren't a choice (any more), e.g. a choice taken off the list.
  const [others, setOthers] = useState<Ingredient[]>([]);
  // Amounts typed in, for everyone together, by line key.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState<string | null>(null);

  // The family's own choices; kept here too so a new one shows up straight away.
  const [ownOptions, setOwnOptions] = useState<OwnAvgOption[]>(household?.avg_options ?? []);
  const groups = useMemo(() => avgGroups(ownOptions), [ownOptions]);
  // The group a new choice is being added to, and what's typed so far.
  const [adding, setAdding] = useState<AvgGroup['key'] | null>(null);
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newUnit, setNewUnit] = useState('');

  // Opening an AVG that's already planned: recognise its choices again.
  useEffect(() => {
    if (!mealId) return;
    getWeekPlan(weekStart)
      .then(({ meals }) => {
        const meal = meals.find((m) => m.id === mealId);
        if (!meal || !isOwnDish(meal)) return;
        const chosen = new Set<string>();
        const rest: Ingredient[] = [];
        const given: Record<string, string> = {};
        for (const ing of meal.custom_ingredients ?? []) {
          const found = findAvgOption(groups, ing.name);
          if (!found) {
            rest.push(ing);
            continue;
          }
          chosen.add(found.option.label);
          const usual = found.option.ingredients[0].quantity;
          if (ing.quantity != null && ing.quantity !== usual) {
            given[found.option.label] = formatQuantity(ing.quantity * meal.servings);
          }
        }
        setSelected(chosen);
        setOthers(rest);
        setAmounts(given);
        setServings(meal.servings);
        setTitle(meal.title);
      })
      .catch((e) => notify('Laden mislukt', (e as Error).message))
      .finally(() => setLoading(false));
    // Only when the screen opens; later changes to the choices come from this screen itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealId, weekStart]);

  const lines = useMemo(() => {
    const result: Line[] = [];
    for (const group of groups) {
      for (const option of group.options) {
        if (!selected.has(option.label)) continue;
        const ing = option.ingredients[0];
        result.push({ key: option.label, name: ing.name, unit: ing.unit, perPerson: ing.quantity });
      }
    }
    for (const ing of others) {
      result.push({ key: `other:${ing.name}`, name: ing.name, unit: ing.unit, perPerson: ing.quantity });
    }
    return result;
  }, [groups, selected, others]);

  const autoTitle = avgTitle(
    groups.filter((g) => g.inTitle).flatMap((g) => g.options.filter((o) => selected.has(o.label)).map((o) => o.label)),
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function startAdding(group: AvgGroup['key']) {
    setAdding(group);
    setNewName('');
    setNewAmount('');
    setNewUnit('');
  }

  /** Saves a new choice for the whole family and picks it for this dish. */
  async function addOption() {
    if (!household || !adding) return;
    const typed = newName.trim();
    if (!typed) return;
    const label = typed.charAt(0).toUpperCase() + typed.slice(1);
    if (groups.some((g) => g.options.some((o) => o.label.toLowerCase() === label.toLowerCase()))) {
      notify('Bestaat al', `${label} staat er al tussen.`);
      return;
    }
    const option: OwnAvgOption = {
      group: adding,
      label,
      name: typed.charAt(0).toLowerCase() + typed.slice(1),
      quantity: parseQuantity(newAmount),
      unit: newUnit.trim() || null,
    };
    const before = ownOptions;
    const next = [...before, option];
    setOwnOptions(next);
    setSelected((prev) => new Set(prev).add(label));
    setAdding(null);
    try {
      await saveAvgOptions(household.id, next);
      refresh();
    } catch (e) {
      setOwnOptions(before);
      notify('Opslaan mislukt', (e as Error).message);
    }
  }

  /** Takes one of the family's own choices off the list; dishes already planned keep it. */
  async function removeOption(option: OwnAvgOption) {
    if (!household) return;
    const ok = await confirm(`${option.label} weghalen?`, 'Het verdwijnt uit de keuzes van het hele gezin.', 'Weghalen', true);
    if (!ok) return;
    const before = ownOptions;
    const next = before.filter((o) => o !== option);
    setOwnOptions(next);
    setSelected((prev) => {
      const rest = new Set(prev);
      rest.delete(option.label);
      return rest;
    });
    try {
      await saveAvgOptions(household.id, next);
      refresh();
    } catch (e) {
      setOwnOptions(before);
      notify('Opslaan mislukt', (e as Error).message);
    }
  }

  /** The amount shown for everyone together: typed in, or the usual amount per person times the people. */
  function amountText(line: Line) {
    if (amounts[line.key] != null) return amounts[line.key];
    return line.perPerson != null ? formatQuantity(line.perPerson * servings) : '';
  }

  async function save() {
    if (!household || !lines.length) return;
    const ingredients: Ingredient[] = lines.map((line) => {
      const typed = amounts[line.key];
      const total = typed != null ? parseQuantity(typed) : null;
      const perPerson = typed != null ? (total != null ? total / servings : null) : line.perPerson;
      return { name: line.name, quantity: perPerson, unit: line.unit };
    });
    const name = title?.trim() || autoTitle;
    setSaving(true);
    try {
      if (mealId) await updateOwnDish(mealId, name, ingredients, servings);
      else await addOwnDish(household.id, weekStart, day, name, ingredients, servings);
      // Back to the week plan, also when we came via the recipe picker.
      router.dismissAll();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.dayBox}>
          <View>
            <Text style={styles.dayName}>{dayName(weekStart, day)}</Text>
            <Text style={styles.dayDate}>{formatShort(dateOfDay(weekStart, day))}</Text>
          </View>
          <Stepper value={servings} onChange={setServings} suffix="pers." />
        </View>

        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.chips}>
              {group.options.map((option) => {
                const own = ownOptions.find((o) => o.group === group.key && o.label === option.label);
                return (
                  <Chip
                    key={option.label}
                    label={option.label}
                    active={selected.has(option.label)}
                    onPress={() => toggle(option.label)}
                    onLongPress={own ? () => removeOption(own) : undefined}
                  />
                );
              })}
              {group.key === 'x' &&
                others.map((ing) => (
                  <Chip
                    key={ing.name}
                    label={ing.name}
                    icon="close"
                    active
                    onPress={() => setOthers(others.filter((o) => o !== ing))}
                  />
                ))}
              {adding !== group.key && <Chip label="Nieuw" icon="add" onPress={() => startAdding(group.key)} />}
            </View>
            {adding === group.key && (
              <View style={styles.newBox}>
                <View style={styles.newRow}>
                  <TextInput
                    value={newAmount}
                    onChangeText={setNewAmount}
                    placeholder="150"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    style={[styles.input, { width: 64 }]}
                  />
                  <TextInput
                    value={newUnit}
                    onChangeText={setNewUnit}
                    placeholder="g"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    style={[styles.input, { width: 56 }]}
                  />
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    onSubmitEditing={addOption}
                    placeholder="Bijv. kabeljauw"
                    placeholderTextColor={colors.placeholder}
                    autoFocus
                    returnKeyType="done"
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
                <Text style={styles.hint}>
                  Hoeveelheid voor 1 persoon (mag leeg). Wat je toevoegt, staat er voortaan voor het hele gezin tussen.
                </Text>
                <View style={styles.newRow}>
                  <Button title="Annuleren" variant="ghost" onPress={() => setAdding(null)} style={{ flex: 1 }} />
                  <Button title="Toevoegen" icon="add" onPress={addOption} disabled={!newName.trim()} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </View>
        ))}
        {ownOptions.length > 0 && (
          <Text style={styles.hint}>Houd een zelf toegevoegde keuze ingedrukt om hem weg te halen.</Text>
        )}

        {lines.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.groupTitle}>Naam in het weekplan</Text>
            <TextInput
              value={title ?? autoTitle}
              onChangeText={setTitle}
              placeholderTextColor={colors.placeholder}
              style={styles.input}
            />
            <Text style={styles.groupTitle}>Op de boodschappenlijst</Text>
            <Text style={styles.hint}>Voor {servings} personen. Pas de hoeveelheid aan als jullie meer of minder eten.</Text>
            {lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <TextInput
                  value={amountText(line)}
                  onChangeText={(v) => setAmounts({ ...amounts, [line.key]: v })}
                  placeholder="–"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, styles.amount]}
                />
                <Text style={styles.unit}>{line.unit ?? ''}</Text>
                <Text style={styles.lineName} numberOfLines={1}>
                  {line.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button
          title={mealId ? 'Opslaan' : 'In het weekplan zetten'}
          icon="checkmark"
          onPress={save}
          loading={saving}
          disabled={!lines.length}
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(16) },
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
  group: { gap: spacing(2) },
  groupTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  newBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(3), gap: spacing(2) },
  newRow: { flexDirection: 'row', gap: spacing(2) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 15,
    color: colors.text,
  },
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing(4), gap: spacing(2) },
  hint: { fontSize: 13, color: colors.textMuted },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  amount: { width: 72, textAlign: 'right' },
  unit: { width: 44, fontSize: 15, color: colors.textMuted },
  lineName: { flex: 1, fontSize: 15, color: colors.text },
});
