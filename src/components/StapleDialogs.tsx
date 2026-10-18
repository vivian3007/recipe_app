import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/lib/theme';

/** A centred sheet over a dimmed screen; tapping next to it closes it. */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {children}
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
 * One product on the fixed list: change its name, or take it off the list for good (when you
 * don't buy it regularly any more). Taking it off asks once more, inside the dialog.
 */
export function StapleDialog({
  name,
  onClose,
  onRename,
  onRemove,
}: {
  /** The product, or null when the dialog is closed. */
  name: string | null;
  onClose: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <Sheet visible={name != null} onClose={onClose}>
      {name != null && <StapleDialogContent key={name} name={name} onClose={onClose} onRename={onRename} onRemove={onRemove} />}
    </Sheet>
  );
}

function StapleDialogContent({
  name,
  onClose,
  onRename,
  onRemove,
}: {
  name: string;
  onClose: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(name);
  const [confirming, setConfirming] = useState(false);

  function save() {
    if (text.trim() && text.trim() !== name) onRename(text.trim());
    onClose();
  }

  if (confirming) {
    return (
      <>
        <Text style={styles.title}>{name} van de vaste lijst halen?</Text>
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
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.hint}>Naam</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={save}
        returnKeyType="done"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { marginTop: -spacing(1) }]}
      />
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
    padding: spacing(4),
    gap: spacing(3),
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
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
});
