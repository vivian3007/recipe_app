import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

/** Labels get the same spelling everywhere: trimmed, lowercase, no commas. */
export function normalizeTag(input: string): string {
  return input.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Type one label, add it, repeat. Earlier used labels are offered as suggestions. */
export function TagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState('');
  const typed = normalizeTag(text);

  function add(tag: string) {
    const t = normalizeTag(tag);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  }

  const open = suggestions.filter((s) => !tags.includes(s) && (!typed || s.includes(typed))).slice(0, 8);

  return (
    <View style={{ gap: spacing(2) }}>
      <Text style={styles.label}>Labels</Text>
      {tags.length > 0 && (
        <View style={styles.wrap}>
          {tags.map((t) => (
            <Pressable key={t} onPress={() => onChange(tags.filter((x) => x !== t))} style={styles.tag} hitSlop={4}>
              <Text style={styles.tagText}>{t}</Text>
              <Ionicons name="close" size={14} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => add(text)}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Bijv. pasta"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable
          onPress={() => add(text)}
          disabled={!typed}
          style={({ pressed }) => [styles.add, (!typed || pressed) && { opacity: 0.5 }]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addText}>Toevoegen</Text>
        </Pressable>
      </View>
      {open.length > 0 && (
        <View style={styles.wrap}>
          {open.map((s) => (
            <Pressable key={s} onPress={() => add(s)} style={styles.suggestion}>
              <Ionicons name="add" size={13} color={colors.textMuted} />
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing(1.5),
    paddingLeft: spacing(3),
    paddingRight: spacing(2),
  },
  tagText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing(2) },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.text,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
  },
  addText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2.5),
  },
  suggestionText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
