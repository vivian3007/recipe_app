import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { notify } from '@/lib/dialogs';
import { enablePush, getPushState, type PushState } from '@/lib/push';
import { useSession } from '@/lib/session';
import { isDemo } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

// "Niet nu" is remembered on this device for a week.
const DISMISS_KEY = 'weekmenu-push-banner-dismissed';
const DISMISS_DAYS = 7;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * On the week plan, as long as this device gets no notifications: turn them on with one tap
 * (on an iPhone: first add the app to the home screen). Gone once they're on.
 */
export function EnablePushBanner() {
  const { profile } = useSession();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);

  // Checked again whenever the week plan is opened, e.g. after turning them on at Gezin.
  useFocusEffect(
    useCallback(() => {
      if (isDemo) return;
      getPushState()
        .then(setState)
        .catch(() => setState('unsupported'));
    }, []),
  );

  if (isDemo || hidden || !profile || (state !== 'off' && state !== 'install-first')) return null;

  async function turnOn() {
    if (!profile) return;
    setBusy(true);
    try {
      const result = await enablePush(profile.id);
      setState(result);
      if (result === 'blocked') {
        notify('Geen toestemming', 'Zet meldingen voor Weekmenu aan bij de instellingen van je telefoon of browser.');
      }
    } catch (e) {
      notify('Meldingen aanzetten mislukt', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Then it just shows again next time.
    }
    setHidden(true);
  }

  return (
    <View style={styles.box}>
      <Ionicons name="notifications-outline" size={22} color={colors.accent} />
      <View style={{ flex: 1, gap: spacing(2) }}>
        <Text style={styles.title}>Krijg een melding als jij aan de beurt bent</Text>
        <Text style={styles.text}>
          {state === 'install-first'
            ? 'Zet Weekmenu op je beginscherm (in Safari: Deel → Zet op beginscherm) en open het daarvandaan. Dan kun je hier meldingen aanzetten.'
            : 'En als de week klaar is, als jij de boodschappen doet.'}
        </Text>
        <View style={styles.actions}>
          {state === 'off' && <Button title="Aanzetten" icon="notifications" onPress={turnOn} loading={busy} />}
          <Pressable onPress={dismiss} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
            <Text style={styles.later}>Niet nu</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing(3),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  text: { fontSize: 14, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  later: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
