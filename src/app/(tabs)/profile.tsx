import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { KeyboardScreen } from '@/components/KeyboardScreen';
import { RotationPlanner } from '@/components/RotationPlanner';
import { Button, Card, Field } from '@/components/ui';
import { saveChooserRotation, setShoppingDay, updateDisplayName } from '@/lib/api';
import { getDemoSession } from '@/lib/api.demo';
import { WEEKDAY_NAMES, WEEKDAY_SHORT, weekStartOf } from '@/lib/dates';
import { confirm, notify } from '@/lib/dialogs';
import { rotationFromThisWeek } from '@/lib/members';
import { useSession } from '@/lib/session';
import { isDemo } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

export default function ProfileScreen() {
  const { profile, household, members, session, refresh, signOut } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  // Shown while a change to the rotation is being saved.
  const [rotationDraft, setRotationDraft] = useState<string[] | null>(null);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // Someone else in the family may have changed the settings.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function changeRotation(rotation: string[]) {
    if (!household) return;
    setRotationDraft(rotation);
    try {
      // The first in the list chooses this week.
      await saveChooserRotation(household.id, rotation, weekStartOf());
      await refresh();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setRotationDraft(null);
    }
  }

  async function changeShoppingDay(day: number) {
    if (!household || day === household.shopping_day || savingDay != null) return;
    const ok = await confirm(
      `Boodschappen op ${WEEKDAY_NAMES[day].toLowerCase()}?`,
      `De weken lopen dan van ${WEEKDAY_NAMES[day].toLowerCase()} t/m ${WEEKDAY_NAMES[(day + 6) % 7].toLowerCase()}. ` +
        'Geplande gerechten blijven op hun eigen datum staan.',
      'Wijzigen',
    );
    if (!ok) return;
    setSavingDay(day);
    try {
      await setShoppingDay(household.id, day);
      await refresh();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setSavingDay(null);
    }
  }

  async function saveName() {
    if (!profile || !name.trim()) return;
    setSaving(true);
    try {
      await updateDisplayName(profile.id, name.trim());
      await refresh();
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function shareCode() {
    if (!household) return;
    Share.share({
      message: `Doe mee met "${household.name}" in de Weekmenu-app! Maak een account en vul deze gezinscode in: ${household.invite_code}`,
    });
  }

  async function confirmSignOut() {
    if (isDemo) {
      if (
        await confirm(
          'Demo opnieuw beginnen?',
          'Alles wat je hebt toegevoegd of veranderd wordt gewist.',
          'Opnieuw beginnen',
          true,
        )
      ) {
        await signOut();
        setName(getDemoSession().profile.display_name);
      }
      return;
    }
    if (await confirm('Uitloggen?', undefined, 'Uitloggen', true)) signOut();
  }

  return (
    <KeyboardScreen>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
      >
        {isDemo && (
          <View style={styles.demo}>
            <Ionicons name="flask-outline" size={20} color={colors.accent} />
            <Text style={styles.demoText}>
              Je gebruikt de demomodus. Alles staat alleen op deze telefoon, met voorbeeldrecepten. Koppel Supabase om
              echt met je gezin te delen (zie de README).
            </Text>
          </View>
        )}

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{household?.name}</Text>
          <Text style={styles.muted}>Deel deze code met je gezin, dan kunnen ze meedoen:</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code}>{household?.invite_code}</Text>
          </View>
          <Button title="Code delen" icon="share-outline" variant="secondary" onPress={shareCode} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Gezinsleden ({members.length})</Text>
          {members.map((m) => (
            <View key={m.id} style={styles.member}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{m.display_name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.memberName}>
                {m.display_name}
                {m.id === profile?.id ? ' (jij)' : ''}
              </Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Boodschappendag</Text>
          <Text style={styles.muted}>
            De week begint op de dag dat jullie boodschappen doen
            {household
              ? `: nu van ${WEEKDAY_NAMES[household.shopping_day].toLowerCase()} t/m ${WEEKDAY_NAMES[
                  (household.shopping_day + 6) % 7
                ].toLowerCase()}.`
              : '.'}
          </Text>
          <View style={styles.weekdays}>
            {WEEKDAY_SHORT.map((short, day) => {
              const active = (savingDay ?? household?.shopping_day) === day;
              return (
                <Pressable
                  key={day}
                  onPress={() => changeShoppingDay(day)}
                  accessibilityLabel={WEEKDAY_NAMES[day]}
                  style={({ pressed }) => [styles.weekday, active && styles.weekdayActive, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.weekdayText, active && styles.weekdayTextActive]}>{short}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <RotationPlanner
          rotation={rotationDraft ?? rotationFromThisWeek(household, members)}
          members={members}
          meId={profile?.id}
          onChange={changeRotation}
          onDragging={setDragging}
        />

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Mijn account</Text>
          <View style={styles.emailRow}>
            <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
            <Text style={styles.muted}>{isDemo ? 'Demo-account' : session?.user.email}</Text>
          </View>
          <Field label="Naam" value={name} onChangeText={setName} />
          <Button
            title="Naam opslaan"
            variant="secondary"
            onPress={saveName}
            loading={saving}
            disabled={!name.trim() || name.trim() === profile?.display_name}
          />
        </Card>

        <Button
          title={isDemo ? 'Demo opnieuw beginnen' : 'Uitloggen'}
          variant="danger"
          icon={isDemo ? 'refresh' : 'log-out-outline'}
          onPress={confirmSignOut}
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(10) },
  card: { gap: spacing(3) },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing(4),
    alignItems: 'center',
  },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.primaryDark },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', color: colors.accent },
  memberName: { fontSize: 16, color: colors.text },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) },
  weekday: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekdayText: { fontSize: 14, fontWeight: '700', color: colors.text },
  weekdayTextActive: { color: '#fff' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  demo: {
    flexDirection: 'row',
    gap: spacing(3),
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  demoText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
});
