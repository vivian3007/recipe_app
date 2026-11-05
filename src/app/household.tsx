import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, Card, Field, Loading } from '@/components/ui';
import { OfflineError } from '@/lib/backend';
import { clearPendingInvite, readPendingInvite } from '@/lib/invite';
import { pageWidth } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { createHousehold, joinHousehold } from '@/lib/family';
import { colors, spacing } from '@/lib/theme';

export default function HouseholdSetup() {
  const { profile, refresh, signOut } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Came here through an invitation: no need to type anything.
  const [joining, setJoining] = useState(() => !!readPendingInvite());

  useEffect(() => {
    const invited = readPendingInvite();
    if (!invited) return;
    (async () => {
      try {
        await joinHousehold(invited);
        clearPendingInvite();
        await refresh();
        // Normally this screen is gone by now; if loading the family failed, don't keep spinning.
        setJoining(false);
      } catch (e) {
        // Without internet it stays, so it can be used on the next try.
        if (!(e instanceof OfflineError)) {
          clearPendingInvite();
          setError('Deze uitnodiging klopt niet meer. Vraag om een nieuwe link, of vul de gezinscode in.');
        } else {
          setCode(invited);
          setError((e as Error).message);
        }
        setJoining(false);
      }
    })();
  }, [refresh]);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'create') await createHousehold(name.trim());
      else await joinHousehold(code);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      return;
    }
    clearPendingInvite();
    await refresh();
  }

  if (joining) return <Loading />;

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={[styles.container, pageWidth]} keyboardShouldPersistTaps="handled">
        <Text style={styles.hello}>Hoi {profile?.display_name}! 👋</Text>
        <Text style={styles.intro}>
          Recepten en weekplannen deel je met je gezin. Ben je de eerste? Start dan hieronder een nieuw gezin en nodig
          de anderen uit. Heeft iemand anders het gezin al aangemaakt? Vraag dan om een uitnodiging, of vul de
          gezinscode in.
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
    </KeyboardScreen>
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
