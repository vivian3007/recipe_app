import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addWeeks, weekLabel, weekRange } from '@/lib/dates';
import { setSelectedWeek } from '@/lib/selectedWeek';
import { colors } from '@/lib/theme';

export function WeekSwitcher({ weekStart }: { weekStart: string }) {
  return (
    <View style={styles.row}>
      <Pressable hitSlop={12} onPress={() => setSelectedWeek(addWeeks(weekStart, -1))} style={styles.arrow}>
        <Ionicons name="chevron-back" size={22} color={colors.primaryDark} />
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.label}>{weekLabel(weekStart)}</Text>
        <Text style={styles.range}>{weekRange(weekStart)}</Text>
      </View>
      <Pressable hitSlop={12} onPress={() => setSelectedWeek(addWeeks(weekStart, 1))} style={styles.arrow}>
        <Ionicons name="chevron-forward" size={22} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 18, fontWeight: '800', color: colors.text },
  range: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
