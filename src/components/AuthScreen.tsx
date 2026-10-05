import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';

export function AuthScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardScreen>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Ionicons name="restaurant" size={40} color="#fff" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardScreen>
    </SafeAreaView>
  );
}

export const authStyles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14 },
  info: { color: colors.accent, fontSize: 14, lineHeight: 20 },
  switch: { textAlign: 'center', color: colors.textMuted, fontSize: 15, marginTop: spacing(2) },
  link: { color: colors.primaryDark, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing(6), gap: spacing(2) },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing(4),
  },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginBottom: spacing(6), lineHeight: 22 },
  form: { gap: spacing(4) },
});
