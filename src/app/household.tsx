import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Card, Field } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

export default function HouseholdSetup() {
  const { profile, refresh, signOut } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    const { error } =
      kind === 'create'
        ? await supabase.rpc('create_household', { household_name: name.trim() })
        : await supabase.rpc('join_household', { code: code.trim() });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    await refresh();
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.hello}>Hoi {profile?.display_name}! 👋</Text>
      <Text style={styles.intro}>
        Recepten en weekplannen deel je met je gezin. Heeft iemand anders het gezin al aangemaakt? Vraag dan de
        gezinscode en vul die hieronder in.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Ik heb een gezinscode</Text>
        <Field value={code} onChangeText={setCode} placeholder="Bijv. 4F9K2A" autoCapitalize="characters" />
        <Button title="Lid worden" onPress={() => run('join')} loading={busy === 'join'} disabled={!code.trim()} />
      </Card>

      <Text style={styles.or}>of</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Nieuw gezin starten</Text>
        <Field value={name} onChangeText={setName} placeholder="Bijv. Familie Vlaanderen" />
        <Button
          title="Gezin aanmaken"
          variant="secondary"
          onPress={() => run('create')}
          loading={busy === 'create'}
          disabled={!name.trim()}
        />
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Uitloggen" variant="ghost" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), gap: spacing(4) },
  hello: { fontSize: 26, fontWeight: '800', color: colors.text },
  intro: { fontSize: 16, color: colors.textMuted, lineHeight: 22 },
  card: { gap: spacing(3) },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  or: { textAlign: 'center', color: colors.textMuted },
  error: { color: colors.danger, textAlign: 'center' },
});
