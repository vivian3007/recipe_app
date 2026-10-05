import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Recipe } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';

export function RecipeImage({ uri, height, rounded = true }: { uri: string | null; height: number; rounded?: boolean }) {
  const style = { height, borderRadius: rounded ? radius.md : 0 };
  if (uri) return <Image source={{ uri }} style={[styles.image, style]} contentFit="cover" transition={150} />;
  return (
    <View style={[styles.image, styles.placeholder, style]}>
      <Ionicons name="restaurant" size={Math.min(40, height / 3)} color={colors.primary} />
    </View>
  );
}

export function RecipeCard({
  recipe,
  favorite,
  onPress,
  onToggleFavorite,
}: {
  recipe: Recipe;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View>
        <RecipeImage uri={recipe.image_url} height={120} />
        <Pressable onPress={onToggleFavorite} hitSlop={10} style={styles.heart}>
          <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? colors.primary : colors.text} />
        </Pressable>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {recipe.title}
      </Text>
      <View style={styles.meta}>
        {recipe.prep_minutes != null && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{recipe.prep_minutes} min</Text>
          </View>
        )}
        {recipe.author?.display_name && (
          <Text style={styles.metaText} numberOfLines={1}>
            van {recipe.author.display_name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(2),
    gap: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: '100%', backgroundColor: colors.primarySoft },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  heart: {
    position: 'absolute',
    top: spacing(2),
    right: spacing(2),
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, paddingHorizontal: spacing(1) },
  meta: { flexDirection: 'row', gap: spacing(2), paddingHorizontal: spacing(1), paddingBottom: spacing(1), flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textMuted },
});
