import Ionicons from '@expo/vector-icons/Ionicons';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { Button } from '@/components/ui';
import { withNewAisle, type AisleSetup, type ShopAisle } from '@/lib/aisles';
import { confirm } from '@/lib/dialogs';
import { colors, radius, spacing } from '@/lib/theme';

// Every row has the same height, so where a dragged row lands follows from how far it moved.
const ROW = 48;
// Near the top or bottom of the list it scrolls along while dragging.
const EDGE = 48;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type Drag = { key: string; from: number; to: number; dy: number; scrollStart: number; frame?: number };

/**
 * The family's aisles: drag them into the order of their own supermarket, give them another name,
 * add their own and remove those again. Every change is saved straight away, for the whole family.
 */
export function AisleEditor({
  visible,
  onClose,
  setup,
  aisles,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  setup: AisleSetup;
  /** The aisles as they are now, in order (familyAisles(setup)). */
  aisles: ShopAisle[];
  onSave: (next: AisleSetup) => void;
}) {
  // The aisle whose name is being changed, and the new name.
  const [renaming, setRenaming] = useState<{ key: string; label: string } | null>(null);
  const [newLabel, setNewLabel] = useState('');

  // Dragging: how far each row is moved out of its place right now.
  const [offsets] = useState(() => new Map<string, Animated.Value>());
  const offset = (key: string) => {
    let value = offsets.get(key);
    if (!value) {
      value = new Animated.Value(0);
      offsets.set(key, value);
    }
    return value;
  };
  const [dragKey, setDragKey] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewport = useRef(0);
  // The rows go back to their place once they're drawn in the new order (no flash of the old one).
  const resetAfterSave = useRef(false);
  const latest = useRef({ aisles, setup, onSave });
  useLayoutEffect(() => {
    latest.current = { aisles, setup, onSave };
    if (resetAfterSave.current) {
      resetAfterSave.current = false;
      offsets.forEach((value) => value.setValue(0));
    }
  });

  function startDrag(key: string) {
    const from = latest.current.aisles.findIndex((a) => a.key === key);
    drag.current = { key, from, to: from, dy: 0, scrollStart: scrollY.current };
    setDragKey(key);
    drag.current.frame = requestAnimationFrame(autoScroll);
  }

  function moveDrag(dy: number) {
    if (!drag.current) return;
    drag.current.dy = dy;
    follow();
  }

  /** Puts the dragged row under the finger and moves the others out of the way. */
  function follow() {
    const d = drag.current;
    if (!d) return;
    const list = latest.current.aisles;
    const shift = d.dy + scrollY.current - d.scrollStart;
    offset(d.key).setValue(shift);
    const to = clamp(Math.round(d.from + shift / ROW), 0, list.length - 1);
    if (to === d.to) return;
    d.to = to;
    list.forEach((a, i) => {
      if (a.key === d.key) return;
      const toValue = d.from < i && i <= to ? -ROW : to <= i && i < d.from ? ROW : 0;
      Animated.timing(offset(a.key), { toValue, duration: 150, useNativeDriver: false }).start();
    });
  }

  function autoScroll() {
    const d = drag.current;
    if (!d) return;
    // Where the finger is, measured from the top of the visible part of the list.
    const pointer = d.from * ROW + ROW / 2 - d.scrollStart + d.dy;
    const speed =
      pointer < EDGE ? -Math.ceil((EDGE - pointer) / 6) : pointer > viewport.current - EDGE
        ? Math.ceil((pointer - viewport.current + EDGE) / 6)
        : 0;
    if (speed !== 0) {
      const max = Math.max(0, latest.current.aisles.length * ROW - viewport.current);
      const y = clamp(scrollY.current + speed, 0, max);
      if (y !== scrollY.current) {
        scrollY.current = y;
        scrollRef.current?.scrollTo({ y, animated: false });
        follow();
      }
    }
    d.frame = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    const d = drag.current;
    if (!d) return;
    if (d.frame) cancelAnimationFrame(d.frame);
    drag.current = null;
    setDragKey(null);
    if (d.to === d.from) {
      Animated.spring(offset(d.key), { toValue: 0, useNativeDriver: false }).start();
      return;
    }
    const order = latest.current.aisles.map((a) => a.key);
    order.splice(d.to, 0, ...order.splice(d.from, 1));
    resetAfterSave.current = true;
    latest.current.onSave({ ...latest.current.setup, order });
  }

  function rename() {
    if (!renaming) return;
    const aisle = aisles.find((a) => a.key === renaming.key);
    const label = renaming.label.trim();
    setRenaming(null);
    if (!aisle || label === aisle.label) return;
    if (aisle.own) {
      if (!label) return;
      onSave({ ...setup, extra: (setup.extra ?? []).map((e) => (e.key === aisle.key ? { ...e, label } : e)) });
    } else {
      // An empty name, or the standard one: back to the standard name.
      const names = { ...setup.names };
      if (!label || label === aisle.standardLabel) delete names[aisle.key];
      else names[aisle.key] = label;
      onSave({ ...setup, names });
    }
  }

  async function remove(aisle: ShopAisle) {
    const ok = await confirm(
      `${aisle.label} weghalen?`,
      'Producten in dit pad gaan terug naar het pad dat de app zelf kiest.',
      'Weghalen',
      true,
    );
    if (!ok) return;
    onSave({
      ...setup,
      extra: (setup.extra ?? []).filter((e) => e.key !== aisle.key),
      order: (setup.order ?? []).filter((k) => k !== aisle.key),
    });
  }

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    setNewLabel('');
    onSave(withNewAisle(setup, aisles, label).setup);
  }

  function close() {
    rename();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Paden</Text>
          <Text style={styles.hint}>
            Sleep ze in de volgorde waarin jullie door je eigen supermarkt lopen. Tik op een naam om die te veranderen.
            Geldt voor het hele gezin.
          </Text>
          <ScrollView
            ref={scrollRef}
            style={{ maxHeight: 420 }}
            scrollEnabled={!dragKey}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            onLayout={(e) => {
              viewport.current = e.nativeEvent.layout.height;
            }}
          >
            {aisles.map((a) => (
              <Animated.View
                key={a.key}
                style={[
                  styles.row,
                  { transform: [{ translateY: offset(a.key) }] },
                  dragKey === a.key && styles.rowDragging,
                ]}
              >
                <DragHandle
                  label={a.label}
                  onStart={() => startDrag(a.key)}
                  onMove={moveDrag}
                  onEnd={endDrag}
                />
                <Ionicons name={a.icon} size={18} color={colors.accent} />
                {renaming?.key === a.key ? (
                  <TextInput
                    value={renaming.label}
                    onChangeText={(label) => setRenaming({ key: a.key, label })}
                    onSubmitEditing={rename}
                    onBlur={rename}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    placeholder={a.standardLabel ?? 'Naam'}
                    placeholderTextColor={colors.placeholder}
                    style={[styles.label, styles.input]}
                  />
                ) : (
                  <Pressable
                    onPress={() => setRenaming({ key: a.key, label: a.label })}
                    accessibilityLabel={`${a.label} een andere naam geven`}
                    style={styles.labelButton}
                  >
                    <Text style={styles.label} numberOfLines={1}>
                      {a.label}
                    </Text>
                    <Ionicons name="pencil-outline" size={13} color={colors.placeholder} />
                  </Pressable>
                )}
                {a.own && (
                  <Pressable
                    onPress={() => remove(a)}
                    hitSlop={6}
                    accessibilityLabel={`${a.label} weghalen`}
                    style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.3 }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </Animated.View>
            ))}
          </ScrollView>
          <View style={styles.addRow}>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              onSubmitEditing={add}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder="Nieuw pad, bijv. Dierenvoer"
              placeholderTextColor={colors.placeholder}
              style={styles.addInput}
            />
            <Button title="Toevoegen" icon="add" variant="secondary" onPress={add} disabled={!newLabel.trim()} />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => onSave({ ...setup, order: [] })} hitSlop={8}>
              <Text style={styles.reset}>Standaardvolgorde</Text>
            </Pressable>
            <Button title="Klaar" onPress={close} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The grip to drag a row by. */
function DragHandle({
  label,
  onStart,
  onMove,
  onEnd,
}: {
  label: string;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
}) {
  // Made once, so a drag keeps going when the list redraws. The callbacks only work with refs, so
  // the first ones stay right.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => onStart(),
      onPanResponderMove: (_, gesture) => onMove(gesture.dy),
      onPanResponderRelease: () => onEnd(),
      onPanResponderTerminate: () => onEnd(),
    }),
  );
  return (
    <View {...responder.panHandlers} accessibilityLabel={`${label} verslepen`} style={styles.handle}>
      <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
    </View>
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
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  rowDragging: {
    zIndex: 10,
    backgroundColor: colors.accentSoft,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  handle: {
    height: ROW,
    justifyContent: 'center',
    paddingHorizontal: spacing(1),
    // On the web: a grab cursor, and dragging doesn't select text or scroll the page.
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none', touchAction: 'none' } as unknown as ViewStyle) : null),
  },
  labelButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1) },
  label: { flexShrink: 1, fontSize: 15, color: colors.text },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  iconButton: { padding: spacing(1) },
  addRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'center', marginTop: spacing(1) },
  addInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 15,
    color: colors.text,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
  reset: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
