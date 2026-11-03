import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/lib/theme';
import type { Staple } from '@/lib/types';

/** A centred sheet over a dimmed screen; tapping next to it closes it. */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Adds products to the fixed list one by one. It stays open, so you can type the next one
 * straight away; "Klaar" closes it.
 */
export function AddStapleDialog({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  /** Adds the product; false when it was already on the list. */
  onAdd: (name: string) => boolean;
}) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<TextInput>(null);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = onAdd(trimmed);
    setResult({ ok, text: ok ? `${trimmed} staat erop` : `${trimmed} stond er al op` });
    setName('');
    input.current?.focus();
  }

  function close() {
    setName('');
    setResult(null);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close}>
      <Text style={styles.title}>Product toevoegen</Text>
      <Text style={styles.hint}>Komt op de vaste lijst, die je elke week langsloopt.</Text>
      <TextInput
        ref={input}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setResult(null);
        }}
        onSubmitEditing={add}
        submitBehavior="submit"
        // The web ignores submitBehavior and leaves the field after Enter without this.
        blurOnSubmit={false}
        autoFocus
        returnKeyType="done"
        placeholder="Bijv. Thee"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
      />
      {result && (
        <View style={styles.result}>
          <Ionicons
            name={result.ok ? 'checkmark-circle' : 'information-circle-outline'}
            size={16}
            color={result.ok ? colors.accent : colors.textMuted}
          />
          <Text style={[styles.resultText, result.ok && { color: colors.accent }]}>{result.text}</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Button title="Klaar" variant="ghost" onPress={close} />
        <Button title="Toevoegen" icon="add" onPress={add} disabled={!name.trim()} />
      </View>
    </Sheet>
  );
}

/** Puts a whole pasted list on the fixed list: one product per line. */
export function PasteListDialog({
  visible,
  onClose,
  onPaste,
}: {
  visible: boolean;
  onClose: () => void;
  onPaste: (text: string) => void;
}) {
  const [text, setText] = useState('');

  function close() {
    setText('');
    onClose();
  }

  function paste() {
    onPaste(text);
    close();
  }

  return (
    <Sheet visible={visible} onClose={close}>
      <Text style={styles.title}>Lijst plakken</Text>
      <Text style={styles.hint}>
        Plak je boodschappenlijstje, bijvoorbeeld uit WhatsApp of Notities. Elke regel wordt een product; wat er al op
        staat, wordt overgeslagen.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={'Druiven\nBananen\nMelk'}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, styles.pasteInput]}
      />
      <View style={styles.actions}>
        <Button title="Annuleren" variant="ghost" onPress={close} />
        <Button title="Op de lijst zetten" icon="add" onPress={paste} disabled={!text.trim()} />
      </View>
    </Sheet>
  );
}

/**
 * Nodig for a product whose kind changes every week (Thee, Vleeswaren): type which ones this week.
 * Without a kind it just goes on the list as it is.
 */
export function KindsDialog({
  staple,
  onClose,
  onConfirm,
}: {
  /** The product, or null when the dialog is closed. */
  staple: Staple | null;
  onClose: () => void;
  /** What goes on the shopping list: the kinds, or the product itself. */
  onConfirm: (names: string[]) => void;
}) {
  return (
    <Sheet visible={staple != null} onClose={onClose}>
      {staple != null && <KindsDialogContent key={staple.id} staple={staple} onClose={onClose} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function KindsDialogContent({
  staple,
  onClose,
  onConfirm,
}: {
  staple: Staple;
  onClose: () => void;
  onConfirm: (names: string[]) => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [kind, setKind] = useState('');
  const input = useRef<TextInput>(null);

  // What's still in the field counts too, unless it's already there.
  const typed = kind.trim();
  const all = !typed || lines.some((l) => l.toLowerCase() === typed.toLowerCase()) ? lines : [...lines, typed];

  function addLine() {
    if (!typed) return;
    setLines(all);
    setKind('');
    input.current?.focus();
  }

  const count = all.length;

  return (
    <>
      <Text style={styles.title}>{staple.name}: welke deze week?</Text>
      <Text style={styles.hint}>Typ de soort en tik op Erbij. Nog een soort? Typ de volgende.</Text>
      {lines.map((line, i) => (
        <View key={line} style={styles.line}>
          <Ionicons name="checkmark" size={16} color={colors.accent} />
          <Text style={styles.lineName} numberOfLines={1}>
            {line}
          </Text>
          <Pressable
            onPress={() => setLines(lines.filter((_, j) => j !== i))}
            hitSlop={8}
            accessibilityLabel={`${line} weghalen`}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <TextInput
        ref={input}
        value={kind}
        onChangeText={setKind}
        onSubmitEditing={addLine}
        submitBehavior="submit"
        // The web ignores submitBehavior and leaves the field after Enter without this.
        blurOnSubmit={false}
        autoFocus
        returnKeyType="done"
        placeholder={lines.length ? 'Nog een soort' : `Soort, bijv. ${staple.name.toLowerCase() === 'thee' ? 'rooibos' : 'ham'}`}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
      />
      <View style={styles.actions}>
        <Button title="Erbij" icon="add" variant="secondary" onPress={addLine} disabled={!typed} />
        <Button
          title={count ? `Op de lijst (${count})` : `Gewoon ${staple.name.toLowerCase()}`}
          icon="checkmark"
          onPress={() => onConfirm(all.length ? all : [staple.name])}
        />
      </View>
    </>
  );
}

/**
 * One product on the fixed list: change its name, choose whether Nodig asks for the kind, put it
 * in another aisle, or take it off the list for good (when you don't buy it regularly any more).
 * Taking it off asks once more, inside the dialog.
 */
export function StapleDialog({
  staple,
  aisleLabel,
  onClose,
  onSave,
  onMoveAisle,
  onRemove,
}: {
  /** The product, or null when the dialog is closed. */
  staple: Staple | null;
  /** The aisle it's in now. */
  aisleLabel: string;
  onClose: () => void;
  onSave: (staple: Staple) => void;
  /** Opens the aisle picker (after this dialog closes). */
  onMoveAisle: () => void;
  onRemove: () => void;
}) {
  return (
    <Sheet visible={staple != null} onClose={onClose}>
      {staple != null && (
        <StapleDialogContent
          key={staple.id}
          staple={staple}
          aisleLabel={aisleLabel}
          onClose={onClose}
          onSave={onSave}
          onMoveAisle={onMoveAisle}
          onRemove={onRemove}
        />
      )}
    </Sheet>
  );
}

function StapleDialogContent({
  staple,
  aisleLabel,
  onClose,
  onSave,
  onMoveAisle,
  onRemove,
}: {
  staple: Staple;
  aisleLabel: string;
  onClose: () => void;
  onSave: (staple: Staple) => void;
  onMoveAisle: () => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(staple.name);
  const [askKind, setAskKind] = useState(!!staple.askKind);
  const [confirming, setConfirming] = useState(false);

  function save() {
    const name = text.trim();
    if (!name) return;
    if (name !== staple.name || askKind !== !!staple.askKind) {
      onSave({ id: staple.id, name, ...(askKind ? { askKind: true } : {}) });
    }
    onClose();
  }

  if (confirming) {
    return (
      <>
        <Text style={styles.title}>{staple.name} van de vaste lijst halen?</Text>
        <Text style={styles.hint}>
          Je ziet het dan niet meer bij de vaste boodschappen. Wat deze week al op het boodschappenlijstje staat, blijft
          daar staan.
        </Text>
        <View style={styles.actions}>
          <Button title="Nee" variant="ghost" onPress={() => setConfirming(false)} />
          <Button title="Ja, weghalen" variant="danger" icon="trash-outline" onPress={onRemove} />
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.title}>{staple.name}</Text>
      <Text style={styles.label}>Naam</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        returnKeyType="done"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { marginTop: -spacing(2) }]}
      />

      <Pressable
        onPress={() => setAskKind(!askKind)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: askKind }}
        style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
      >
        <Ionicons
          name={askKind ? 'checkbox' : 'square-outline'}
          size={22}
          color={askKind ? colors.accent : colors.textMuted}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Soort kiezen bij Nodig</Text>
          <Text style={styles.optionText}>
            Voor wat elke week anders is, zoals thee of vleeswaren: dan typ je bij Nodig welke (bijv. rooibos).
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={onMoveAisle} style={({ pressed }) => [styles.aisleRow, pressed && { opacity: 0.6 }]}>
        <Text style={styles.label}>Pad</Text>
        <Text style={styles.aisleValue} numberOfLines={1}>
          {aisleLabel}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>

      <View style={styles.actions}>
        <Button title="Annuleren" variant="ghost" onPress={onClose} />
        <Button title="Opslaan" onPress={save} disabled={!text.trim()} />
      </View>
      <Pressable
        onPress={() => setConfirming(true)}
        style={({ pressed }) => [styles.removeRow, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Text style={styles.removeText}>Van de vaste lijst halen</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing(4) },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    alignSelf: 'center',
  },
  sheetContent: { padding: spacing(4), gap: spacing(3) },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: -spacing(2) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 16,
    color: colors.text,
  },
  pasteInput: { minHeight: 160, maxHeight: 320, textAlignVertical: 'top' },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: -spacing(1) },
  resultText: { fontSize: 14, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing(2) },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
  },
  removeText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  lineName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
  },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionText: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  aisleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
  },
  aisleValue: { flex: 1, textAlign: 'right', fontSize: 14, color: colors.textMuted },
});
