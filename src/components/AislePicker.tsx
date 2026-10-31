import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { guessAisle, type ShopAisle } from '@/lib/aisles';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * "In welk gangpad ligt …?": choose another aisle for a product, back to the automatic one, or
 * make a new aisle for it.
 */
export function AislePicker({
  name,
  current,
  moved,
  aisles,
  onPick,
  onNewAisle,
  onClose,
}: {
  /** The product, or null when the picker is closed. */
  name: string | null;
  /** The aisle it's in now. */
  current: string | null;
  /** Someone chose its aisle (so "Automatisch" can take that back). */
  moved: boolean;
  aisles: ShopAisle[];
  /** null: back to the automatic aisle. */
  onPick: (key: string | null) => void;
  onNewAisle: (label: string) => void;
  onClose: () => void;
}) {
  const [newAisle, setNewAisle] = useState('');

  function close() {
    setNewAisle('');
    onClose();
  }

  function makeNew() {
    const label = newAisle.trim();
    if (!label) return;
    setNewAisle('');
    onNewAisle(label);
  }

  return (
    <Modal visible={name != null} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>In welk gangpad ligt {name}?</Text>
          <Text style={styles.hint}>De app onthoudt het voor het hele gezin.</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {name != null && moved && (
              <Pressable onPress={() => onPick(null)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Ionicons name="sparkles-outline" size={18} color={colors.textMuted} />
                <Text style={styles.label}>Automatisch ({aisles.find((a) => a.key === guessAisle(name))?.label})</Text>
              </Pressable>
            )}
            {aisles.map((a) => {
              const active = current === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => onPick(a.key)}
                  style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name={a.icon} size={18} color={active ? colors.accent : colors.textMuted} />
                  <Text style={[styles.label, active && { fontWeight: '700' }]}>{a.label}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.newRow}>
            <TextInput
              value={newAisle}
              onChangeText={setNewAisle}
              onSubmitEditing={makeNew}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder="Of een nieuw pad, bijv. Dierenvoer"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
            />
            <Button title="Maken" icon="add" variant="secondary" onPress={makeNew} disabled={!newAisle.trim()} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing(5) },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    gap: spacing(2),
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  label: { flex: 1, fontSize: 15, color: colors.text },
  newRow: { flexDirection: 'row', gap: spacing(2) },
  input: {
    flex: 1,
    // On the web a text field won't shrink below its default width otherwise (narrow phones).
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    fontSize: 15,
    color: colors.text,
  },
});
