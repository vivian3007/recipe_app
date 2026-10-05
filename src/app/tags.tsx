import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, Chip, EmptyState, Loading } from '@/components/ui';
import { replaceTagsEverywhere } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import {
  clearSelectedTags,
  normalizeTag,
  replaceSelectedTags,
  similarTags,
  tagsByUse,
  toggleSelectedTag,
  useSelectedTags,
} from '@/lib/tags';
import { colors, radius, spacing } from '@/lib/theme';
import { useRecipes } from '@/lib/useRecipes';

/**
 * All labels, searchable, to filter the recipes on one or more of them. In edit mode labels
 * can be merged, renamed or removed in all recipes at once.
 */
export default function Tags() {
  const navigation = useNavigation();
  const { recipes, loading, reload } = useRecipes();
  const selected = useSelectedTags();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tags = useMemo(() => tagsByUse(recipes), [recipes]);
  const suggestions = useMemo(() => (editing ? similarTags(tags).slice(0, 5) : []), [editing, tags]);
  const q = query.trim().toLowerCase();
  const visible = q ? tags.filter((t) => t.tag.includes(q)) : tags;
  const matching = recipes.filter((r) => selected.every((t) => r.tags.includes(t))).length;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          hitSlop={10}
          onPress={() => {
            setEditing((e) => !e);
            setPicked([]);
            setNaming(false);
            setMessage(null);
          }}
        >
          <Text style={styles.headerButton}>{editing ? 'Klaar' : 'Bewerken'}</Text>
        </Pressable>
      ),
    });
  }, [navigation, editing]);

  function togglePicked(tag: string) {
    setPicked((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function startNaming() {
    // Merging keeps the most used name unless you choose another; `tags` is sorted by use.
    setName(tags.find((t) => picked.includes(t.tag))?.tag ?? picked[0]);
    setNaming(true);
  }

  /** Replaces `from` by `to` in every recipe (null removes them), after asking. */
  async function apply(from: string[], to: string | null) {
    if (to != null && from.length === 1 && from[0] === to) {
      setNaming(false);
      return;
    }
    const count = recipes.filter((r) => r.tags.some((t) => from.includes(t))).length;
    const recipesText = `${count} ${count === 1 ? 'recept' : 'recepten'}`;
    const list = from.join(', ');
    const joinsExisting = to != null && !from.includes(to) && tags.some((t) => t.tag === to);
    const ok =
      to == null
        ? await confirm(
            'Labels verwijderen?',
            `${list} verdwijnt bij ${recipesText}. De recepten zelf blijven bestaan.`,
            'Verwijderen',
            true,
          )
        : await confirm(
            from.length > 1 || joinsExisting ? 'Labels samenvoegen?' : 'Label hernoemen?',
            `${list} ${from.length > 1 ? 'worden' : 'wordt'} "${to}"${joinsExisting ? ' (dat label bestaat al)' : ''}. Dit verandert ${recipesText}, ook die van anderen in het gezin.`,
            'Doorgaan',
          );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      await replaceTagsEverywhere(from, to);
      replaceSelectedTags(from, to);
      setPicked([]);
      setNaming(false);
      setMessage(to == null ? `Verwijderd bij ${recipesText}.` : `Klaar: ${recipesText} aangepast.`);
    } catch (e) {
      setMessage(`Dat lukte niet helemaal: ${(e as Error).message}. Probeer het nog een keer.`);
    } finally {
      await reload();
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  const footerPadding = { paddingBottom: spacing(4) + insets.bottom };

  return (
    <KeyboardScreen>
      <View style={styles.header}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Zoek in ${tags.length} labels…`}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        {editing ? (
          message && <Text style={styles.message}>{message}</Text>
        ) : (
          selected.length > 0 && (
            <View style={styles.selectedRow}>
              <Text style={styles.selectedText} numberOfLines={2}>
                Gekozen: <Text style={{ fontWeight: '700', color: colors.text }}>{selected.join(', ')}</Text>
              </Text>
              <Pressable onPress={clearSelectedTags} hitSlop={8}>
                <Text style={styles.clear}>Wissen</Text>
              </Pressable>
            </View>
          )
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(t) => t.tag}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          suggestions.length > 0 && !q ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsTitle}>Lijken op elkaar</Text>
              {suggestions.map((group) => (
                <View key={group[0].tag} style={styles.suggestion}>
                  <Text style={styles.suggestionText}>
                    {group.map((g) => `${g.tag} (${g.count})`).join(' · ')}
                  </Text>
                  <Pressable
                    disabled={busy}
                    onPress={() => apply(
                      group.map((g) => g.tag),
                      group[0].tag,
                    )}
                    style={({ pressed }) => [styles.suggestionButton, (busy || pressed) && { opacity: 0.5 }]}
                  >
                    <Ionicons name="git-merge-outline" size={15} color="#fff" />
                    <Text style={styles.suggestionButtonText}>Samenvoegen tot {group[0].tag}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="pricetag-outline" title="Geen labels gevonden" />}
        renderItem={({ item }) => {
          const isOn = editing ? picked.includes(item.tag) : selected.includes(item.tag);
          const icon = editing ? (isOn ? 'checkbox' : 'square-outline') : isOn ? 'checkmark-circle' : 'ellipse-outline';
          return (
            <Pressable
              onPress={() => (editing ? togglePicked(item.tag) : toggleSelectedTag(item.tag))}
              disabled={busy}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name={icon} size={24} color={isOn ? colors.primary : colors.border} />
              <Text style={[styles.tag, isOn && { fontWeight: '700' }]}>{item.tag}</Text>
              <Text style={styles.count}>{item.count}</Text>
            </Pressable>
          );
        }}
      />

      {!editing ? (
        <View style={[styles.footer, footerPadding]}>
          <Button
            title={selected.length ? `Toon ${matching} ${matching === 1 ? 'recept' : 'recepten'}` : 'Klaar'}
            icon={selected.length ? 'checkmark' : undefined}
            onPress={() => router.back()}
          />
        </View>
      ) : naming ? (
        <View style={[styles.footer, footerPadding, { gap: spacing(3) }]}>
          <Text style={styles.footerLabel}>
            {picked.length > 1 ? `${picked.length} labels samenvoegen tot:` : `"${picked[0]}" hernoemen naar:`}
          </Text>
          {picked.length > 1 && (
            <View style={styles.nameChoices}>
              {picked.map((t) => (
                <Chip key={t} label={t} active={name === t} onPress={() => setName(t)} />
              ))}
            </View>
          )}
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoFocus={picked.length === 1}
            placeholder="Nieuwe naam"
            placeholderTextColor={colors.placeholder}
            style={styles.nameInput}
          />
          <View style={styles.footerButtons}>
            <Button title="Annuleren" variant="secondary" onPress={() => setNaming(false)} style={{ flex: 1 }} />
            <Button
              title="Opslaan"
              icon="checkmark"
              loading={busy}
              disabled={!normalizeTag(name)}
              onPress={() => apply(picked, normalizeTag(name))}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <View style={[styles.footer, footerPadding]}>
          {picked.length === 0 ? (
            <Text style={styles.hint}>
              Tik labels aan om ze samen te voegen, te hernoemen of te verwijderen. Dat geldt voor alle recepten.
            </Text>
          ) : (
            <View style={styles.footerButtons}>
              <Button
                title={picked.length > 1 ? `Samenvoegen (${picked.length})` : 'Hernoemen'}
                icon={picked.length > 1 ? 'git-merge-outline' : 'create-outline'}
                variant="secondary"
                disabled={busy}
                onPress={startNaming}
                style={{ flex: 1 }}
              />
              <Button
                title="Verwijderen"
                icon="trash-outline"
                variant="danger"
                loading={busy}
                onPress={() => apply(picked, null)}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { color: colors.primaryDark, fontWeight: '700', fontSize: 16 },
  header: { padding: spacing(4), paddingBottom: spacing(2), gap: spacing(2) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(3),
  },
  searchInput: { flex: 1, paddingVertical: spacing(3), fontSize: 16, color: colors.text },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  selectedText: { flex: 1, fontSize: 14, color: colors.textMuted },
  clear: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  message: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  list: { paddingHorizontal: spacing(4), paddingBottom: spacing(4) },
  suggestions: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(3),
    gap: spacing(3),
    marginBottom: spacing(2),
  },
  suggestionsTitle: { fontSize: 14, fontWeight: '800', color: colors.accent },
  suggestion: { gap: spacing(1.5) },
  suggestionText: { fontSize: 14, color: colors.text },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing(1),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  suggestionButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tag: { flex: 1, fontSize: 16, color: colors.text },
  count: { fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  footer: {
    padding: spacing(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  footerButtons: { flexDirection: 'row', gap: spacing(3) },
  nameChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  nameInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.text,
  },
  hint: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
