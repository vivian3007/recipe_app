import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { RecipeCard } from '@/components/RecipeCard';
import { Button, Chip, EmptyState, Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import { useRecipes } from '@/lib/useRecipes';

type Filter = 'all' | 'favorites' | 'mine';

export default function Home() {
  const { profile } = useSession();
  const { recipes, favorites, loading, error, reload, toggleFavorite } = useRecipes();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const tags = useMemo(
    () => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'nl')),
    [recipes],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (filter === 'favorites' && !favorites.has(r.id)) return false;
      if (filter === 'mine' && r.created_by !== profile?.id) return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (q && !`${r.title} ${r.description ?? ''} ${r.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recipes, favorites, filter, tag, query, profile]);

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visible.length % 2 ? [...visible, null] : visible}
        keyExtractor={(r) => r?.id ?? 'spacer'}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing(3) }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing(3), marginBottom: spacing(1) }}>
            <Text style={styles.greeting}>Wat eten we, {profile?.display_name}?</Text>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Zoek een gerecht…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                clearButtonMode="while-editing"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
              <Chip label="Alles" active={filter === 'all' && !tag} onPress={() => { setFilter('all'); setTag(null); }} />
              <Chip label="Mijn favorieten" icon="heart" active={filter === 'favorites'} onPress={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')} />
              <Chip label="Door mij" active={filter === 'mine'} onPress={() => setFilter(filter === 'mine' ? 'all' : 'mine')} />
              {tags.map((t) => (
                <Chip key={t} label={t} active={tag === t} onPress={() => setTag(tag === t ? null : t)} />
              ))}
            </ScrollView>
            {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          recipes.length === 0 ? (
            <EmptyState
              icon="book-outline"
              title="Nog geen recepten"
              text="Voeg je eerste lekkere gerecht toe. Je hele gezin ziet het hier ook."
              action={<Button title="Recept toevoegen" icon="add" onPress={() => router.push('/recipe/edit')} />}
            />
          ) : (
            <EmptyState
              icon={filter === 'favorites' ? 'heart-outline' : 'search'}
              title={filter === 'favorites' ? 'Nog geen favorieten' : 'Niets gevonden'}
              text={filter === 'favorites' ? 'Tik op het hartje bij een recept om het aan je collectie toe te voegen.' : 'Probeer een andere zoekterm.'}
            />
          )
        }
        renderItem={({ item }) =>
          item ? (
            <RecipeCard
              recipe={item}
              favorite={favorites.has(item.id)}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.id } })}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )
        }
      />
      <Pressable style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]} onPress={() => router.push('/recipe/edit')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4), gap: spacing(3), paddingBottom: 100 },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
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
  fab: {
    position: 'absolute',
    right: spacing(5),
    bottom: spacing(5),
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
