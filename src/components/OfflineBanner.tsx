import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { formatSavedAt } from '@/lib/dates';
import { useIsOffline } from '@/lib/offlineCache';
import { colors, radius, spacing } from '@/lib/theme';

/** Says there's no internet, and how recent what you're looking at is. */
export function OfflineBanner({ savedAt }: { savedAt?: number | null }) {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
      <Text style={styles.text}>Geen internet{savedAt ? ` · bijgewerkt ${formatSavedAt(savedAt)}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  text: { flex: 1, fontSize: 13, color: colors.textMuted },
});
