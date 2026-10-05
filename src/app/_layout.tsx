import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '@/components/ui';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

function RootNavigator() {
  const { loading, signedIn, household } = useSession();
  if (loading) return <Loading />;

  const hasHousehold = !!household;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primaryDark,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasHousehold}>
        <Stack.Screen name="household" options={{ title: 'Jouw gezin', headerBackVisible: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && hasHousehold}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="recipe/edit" options={{ title: 'Recept', presentation: 'modal' }} />
        <Stack.Screen name="pick-recipe" options={{ title: 'Kies een gerecht', presentation: 'modal' }} />
        <Stack.Screen name="add-to-week" options={{ title: 'Toevoegen aan weekplan', presentation: 'modal' }} />
        <Stack.Screen name="adjust-meal" options={{ title: 'Aanpassen voor deze avond', presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}
