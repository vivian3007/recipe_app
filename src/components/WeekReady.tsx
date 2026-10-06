import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { markWeekReady, unmarkWeekReady } from '@/lib/api';
import { weekStartOf } from '@/lib/dates';
import { notify } from '@/lib/dialogs';
import { memberLabel } from '@/lib/members';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { WeekPlan } from '@/lib/types';

/** "Mama", "Mama en Papa", "Mama, Papa en jou". */
function names(list: string[]) {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} en ${list[list.length - 1]}`;
}

/**
 * "Week is klaar": whoever chooses marks the week as ready, and the shoppers get a notification
 * that the shopping list can be made. Until then, whoever chooses gets daily reminders.
 */
export function WeekReady({
  weekStart,
  plan,
  hasMeals,
  onChange,
}: {
  weekStart: string;
  plan: WeekPlan | null;
  hasMeals: boolean;
  onChange: () => void;
}) {
  const { household, members, profile } = useSession();
  const [busy, setBusy] = useState(false);
  // Weeks that are over don't need it any more.
  if (!household || weekStart < weekStartOf()) return null;

  const shoppers = household.shopper_ids.filter((id) => members.some((m) => m.id === id));
  const shopperNames = names(
    shoppers.map((id) => (id === profile?.id ? 'jij' : (memberLabel(id, members, profile?.id) ?? ''))).filter(Boolean),
  );
  const ready = !!plan?.ready_at;
  const readyBy = plan?.ready_by ? memberLabel(plan.ready_by, members, profile?.id) : null;

  async function markReady() {
    if (!household) return;
    setBusy(true);
    try {
      const { notified, shoppers: count } = await markWeekReady(household.id, weekStart);
      onChange();
      if (count > 0 && notified === 0) {
        notify(
          'De week is klaar',
          'Er is niemand een melding gestuurd: wie de boodschappen doet, heeft meldingen nog niet aangezet (bij Gezin).',
        );
      }
    } catch (e) {
      notify('Dat lukte niet', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markNotReady() {
    if (!household) return;
    setBusy(true);
    try {
      await unmarkWeekReady(household.id, weekStart);
      onChange();
    } catch (e) {
      notify('Dat lukte niet', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ready) {
    return (
      <View style={[styles.box, styles.readyBox]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>De week is klaar</Text>
          <Text style={styles.text}>
            {readyBy ? `Ingevuld door ${readyBy === 'Jij' ? 'jou' : readyBy}. ` : ''}
            {shoppers.length ? `${shopperNames.charAt(0).toUpperCase()}${shopperNames.slice(1)} kan de boodschappen doen.` : ''}
          </Text>
        </View>
        <Chip label="Toch aanpassen" icon="arrow-undo" onPress={busy ? undefined : markNotReady} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {shoppers.length
          ? `Klaar met kiezen? Dan krijgt ${shopperNames} een melding dat het boodschappenlijstje gemaakt kan worden.`
          : 'Klaar met kiezen? Kies bij Gezin wie de boodschappen doet, dan krijgt die een melding.'}
      </Text>
      <Button title="Week is klaar" icon="checkmark" onPress={markReady} loading={busy} disabled={!hasMeals} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(3),
  },
  readyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  text: { fontSize: 14, color: colors.textMuted },
});
