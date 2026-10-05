import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseQuantity } from '@/lib/quantities';
import { colors, radius, spacing } from '@/lib/theme';
import type { Ingredient } from '@/lib/types';

export type IngredientRow = { key: string; name: string; quantity: string; unit: string };

let rowCounter = 0;
export const newRow = (name = '', quantity = '', unit = ''): IngredientRow => ({
  key: String(rowCounter++),
  name,
  quantity,
  unit,
});

/** Rows for editing, with one empty row at the bottom. Quantities are shown exactly, with a Dutch comma. */
export function rowsFromIngredients(ingredients: Ingredient[]): IngredientRow[] {
  return [
    ...ingredients.map((i) => newRow(i.name, i.quantity != null ? String(i.quantity).replace('.', ',') : '', i.unit ?? '')),
    newRow(),
  ];
}

export function rowsToIngredients(rows: IngredientRow[]): Ingredient[] {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), unit: r.unit.trim() || null, quantity: parseQuantity(r.quantity) }));
}

/** Quantity / unit / name rows; there is always one empty row at the bottom so adding is effortless. */
export function IngredientEditor({ rows, onChange }: { rows: IngredientRow[]; onChange: (rows: IngredientRow[]) => void }) {
  function updateRow(key: string, patch: Partial<IngredientRow>) {
    const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    const last = next[next.length - 1];
    onChange(last.name || last.quantity || last.unit ? [...next, newRow()] : next);
  }

  function removeRow(key: string) {
    if (rows.length > 1) onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <View style={{ gap: spacing(2) }}>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <TextInput
            value={row.quantity}
            onChangeText={(quantity) => updateRow(row.key, { quantity })}
            placeholder="200"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, { width: 64 }]}
          />
          <TextInput
            value={row.unit}
            onChangeText={(unit) => updateRow(row.key, { unit })}
            placeholder="g"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.input, { width: 64 }]}
          />
          <TextInput
            value={row.name}
            onChangeText={(name) => updateRow(row.key, { name })}
            placeholder="gehakt"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable hitSlop={8} onPress={() => removeRow(row.key)}>
            <Ionicons name="close-circle" size={22} color={colors.border} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 15,
    color: colors.text,
  },
});
