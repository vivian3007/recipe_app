import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { formatAmount, type ShoppingItem } from '@/lib/quantities';
import { colors, radius, spacing } from '@/lib/theme';

/** "1,5" for 1.5: what goes in the field. */
const toField = (q: number) => String(Math.round(q * 100) / 100).replace('.', ',');

/**
 * How many of a product on this week's list, e.g. 1 mozzarella instead of 2 because there's
 * still one at home. Recipe amounts can go back to what the recipes say.
 */
export function AmountDialog({
  item,
  onClose,
  onSave,
}: {
  /** The product, or null when the dialog is closed. */
  item: ShoppingItem | null;
  onClose: () => void;
  /** null: back to what the recipes say (or just one, for something added by hand). */
  onSave: (quantity: number | null) => void;
}) {
  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {item && <Content key={item.key} item={item} onClose={onClose} onSave={onSave} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Content({
  item,
  onClose,
  onSave,
}: {
  item: ShoppingItem;
  onClose: () => void;
  onSave: (quantity: number | null) => void;
}) {
  const [text, setText] = useState(toField(item.quantity ?? 1));
  const value = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(value) && value > 0;
  // Grams and milliliters go up and down in handy steps, pieces one by one.
  const big = item.unit === 'g' || item.unit === 'ml';
  const step = big ? (value >= 100 ? 50 : 10) : 1;

  function change(by: number) {
    const base = valid ? value : (item.quantity ?? 1);
    const next = Math.max(step, Math.round((base + by) / step) * step);
    setText(toField(next));
  }

  function save() {
    if (!valid) return;
    // Nothing changed: it shouldn't count as a changed amount ("was 500 g").
    if (toField(value) !== toField(item.quantity ?? 1)) {
      onSave(item.planned != null && value === item.planned ? null : value);
    }
    onClose();
  }

  return (
    <>
      <Text style={styles.title}>Hoeveel {item.name}?</Text>
      <Text style={styles.hint}>Alleen voor deze week.</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => change(-step)}
          hitSlop={6}
          accessibilityLabel="Minder"
          style={({ pressed }) => [styles.step, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={save}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
        />
        <Pressable
          onPress={() => change(step)}
          hitSlop={6}
          accessibilityLabel="Meer"
          style={({ pressed }) => [styles.step, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
        {!!item.unit && <Text style={styles.unit}>{item.unit}</Text>}
      </View>
      {item.planned != null && (
        <Pressable
          onPress={() => {
            onSave(null);
            onClose();
          }}
          style={({ pressed }) => [styles.reset, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="arrow-undo-outline" size={15} color={colors.textMuted} />
          <Text style={styles.resetText}>
            Terug naar {formatAmount(item.planned, item.unit)} (volgens de recepten)
          </Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Button title="Annuleren" variant="ghost" onPress={onClose} />
        <Button title="Opslaan" onPress={save} disabled={!valid} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing(5) },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    gap: spacing(3),
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: -spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: 80,
    // On the web a text field won't shrink below its default width otherwise.
    minWidth: 0,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  unit: { fontSize: 16, color: colors.textMuted },
  reset: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  resetText: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing(2) },
});
