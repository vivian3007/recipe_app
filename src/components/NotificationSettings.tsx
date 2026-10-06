import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Stepper } from '@/components/ui';
import { saveNotificationSettings } from '@/lib/api';
import { WEEKDAY_NAMES } from '@/lib/dates';
import { notify } from '@/lib/dialogs';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';
import { useSession } from '@/lib/session';
import { isDemo } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import type { NotificationSettings as Settings } from '@/lib/types';

const DEVICE_TEXT: Record<Exclude<PushState, 'on' | 'off'>, string> = {
  blocked: 'Meldingen zijn geblokkeerd. Zet ze aan bij de instellingen van je telefoon of browser voor Weekmenu.',
  'install-first':
    'Zet Weekmenu eerst op je beginscherm (in Safari: Deel → Zet op beginscherm) en open het daarvandaan. Daarna kun je hier meldingen aanzetten.',
  unsupported: 'Deze browser kan geen meldingen ontvangen.',
};

/**
 * Notifications: turning them on for this phone, when whoever chooses gets a reminder, and who
 * does the shopping (they hear when the coming week is ready). The timing is for the whole family.
 */
export function NotificationSettings() {
  const { profile, household, members, refresh } = useSession();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  // Shown straight away while saving.
  const [draft, setDraft] = useState<Partial<Settings>>({});

  useEffect(() => {
    if (isDemo) return;
    getPushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);

  if (!household || !profile) return null;
  const settings: Settings = {
    remind_days_before: draft.remind_days_before ?? household.remind_days_before,
    remind_hour: draft.remind_hour ?? household.remind_hour,
    shopper_ids: draft.shopper_ids ?? household.shopper_ids,
  };

  async function change(patch: Partial<Settings>) {
    if (!household) return;
    setDraft((d) => ({ ...d, ...patch }));
    try {
      await saveNotificationSettings(household.id, patch);
      await refresh();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setDraft((d) => {
        const rest = { ...d };
        for (const key of Object.keys(patch) as (keyof Settings)[]) delete rest[key];
        return rest;
      });
    }
  }

  async function toggleDevice() {
    if (!profile) return;
    setBusy(true);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        const result = await enablePush(profile.id);
        setState(result);
        if (result === 'blocked') notify('Geen toestemming', DEVICE_TEXT.blocked);
      }
    } catch (e) {
      notify('Meldingen aanzetten mislukt', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleShopper(id: string) {
    const ids = settings.shopper_ids;
    change({ shopper_ids: ids.includes(id) ? ids.filter((s) => s !== id) : [...ids, id] });
  }

  const shoppingDay = WEEKDAY_NAMES[household.shopping_day].toLowerCase();
  const days = settings.remind_days_before;
  const hour = settings.remind_hour;
  const first =
    days === 0 ? `op ${shoppingDay} zelf` : `${days === 1 ? '1 dag' : `${days} dagen`} vóór ${shoppingDay}`;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Meldingen</Text>

      {isDemo ? (
        <Text style={styles.muted}>In de demomodus worden geen meldingen verstuurd.</Text>
      ) : state === 'on' || state === 'off' ? (
        <View style={styles.device}>
          <Ionicons
            name={state === 'on' ? 'notifications' : 'notifications-off-outline'}
            size={20}
            color={state === 'on' ? colors.accent : colors.textMuted}
          />
          <Text style={[styles.text, { flex: 1 }]}>
            {state === 'on' ? 'Staan aan op dit toestel.' : 'Staan nog uit op dit toestel.'}
          </Text>
          <Button
            title={state === 'on' ? 'Uitzetten' : 'Aanzetten'}
            variant={state === 'on' ? 'ghost' : 'primary'}
            onPress={toggleDevice}
            loading={busy}
          />
        </View>
      ) : (
        state && <Text style={styles.muted}>{DEVICE_TEXT[state]}</Text>
      )}

      <Text style={styles.subtitle}>Herinnering voor wie aan de beurt is</Text>
      <View style={styles.row}>
        <Text style={styles.text}>Eerste melding</Text>
        <Stepper
          value={days}
          onChange={(v) => change({ remind_days_before: v })}
          min={0}
          max={6}
          suffix={days === 1 ? 'dag ervoor' : 'dagen ervoor'}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.text}>Om</Text>
        <Stepper value={hour} onChange={(v) => change({ remind_hour: v })} min={0} max={23} suffix="uur" />
      </View>
      <Text style={styles.muted}>
        Wie de komende week kiest, krijgt {first} om {hour}:00 een melding, en daarna elke dag om {hour}:00 tot de week
        op &quot;Week is klaar&quot; staat.
      </Text>

      <Text style={styles.subtitle}>Wie doet de boodschappen?</Text>
      <View style={styles.chips}>
        {members.map((m) => (
          <Chip
            key={m.id}
            label={m.id === profile.id ? `${m.display_name} (ik)` : m.display_name}
            icon={settings.shopper_ids.includes(m.id) ? 'cart' : undefined}
            active={settings.shopper_ids.includes(m.id)}
            onPress={() => toggleShopper(m.id)}
          />
        ))}
      </View>
      <Text style={styles.muted}>
        {settings.shopper_ids.length
          ? 'Zij krijgen een melding zodra de komende week klaar is, zodat het boodschappenlijstje gemaakt kan worden.'
          : 'Kies wie de boodschappen doet; die krijgt een melding zodra de komende week klaar is.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing(3) },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing(1) },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  device: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
});
