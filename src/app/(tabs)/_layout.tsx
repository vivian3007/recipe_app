import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import type { IconName } from '@/components/ui';
import { colors } from '@/lib/theme';

function icon(name: IconName, focusedName: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : name} size={24} color={color} />;
  };
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '800', fontSize: 20 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Recepten', tabBarIcon: icon('book-outline', 'book') }} />
      <Tabs.Screen name="week" options={{ title: 'Weekplan', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="shopping" options={{ title: 'Boodschappen', tabBarIcon: icon('cart-outline', 'cart') }} />
      <Tabs.Screen name="profile" options={{ title: 'Gezin', tabBarIcon: icon('people-outline', 'people') }} />
    </Tabs>
  );
}
