import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { savePendingInvite } from '@/lib/invite';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

/**
 * Where an invitation link lands, logged in or not. Without an account you go on to make one, and
 * "Jouw gezin" uses the code once you're in. Someone in another family stays where they are:
 * changing family is too big a step to happen by opening a link.
 */
export default function Invitation() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { signedIn, household } = useSession();
  const invited = String(code ?? '').trim().toUpperCase();
  // Before the redirect below: the next screen reads it as soon as it opens.
  useState(() => {
    if (!household && invited) savePendingInvite(invited);
  });

  if (!household) return <Redirect href={signedIn ? '/household' : '/register'} />;
  if (household.invite_code === invited) return <Redirect href="/" />;

  return (
    <View style={styles.page}>
      <Card style={styles.card}>
        <Text style={styles.title}>Je zit al in een gezin</Text>
        <Text style={styles.text}>
          Je hoort nu bij {household.name}. Daarom is deze uitnodiging niet gebruikt, en is er niets veranderd.
        </Text>
        <Button title="Naar de app" onPress={() => router.replace('/')} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing(5), backgroundColor: colors.background },
  card: { gap: spacing(3), width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  text: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
});
