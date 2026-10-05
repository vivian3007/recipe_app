import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

/**
 * Checks for a new version when the app starts. Without this, a downloaded update only appears
 * the next time the app is opened; now the user can restart into it right away.
 * Does nothing in Expo Go, during development and on the web (the web version is always current).
 */
export function useAppUpdates() {
  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;
        Alert.alert('Nieuwe versie van Weekmenu', 'Er is een update klaar. Wil je de app nu herstarten?', [
          { text: 'Later', style: 'cancel' },
          { text: 'Herstarten', onPress: () => Updates.reloadAsync() },
        ]);
      } catch {
        // No internet or no update server: just keep using the current version.
      }
    })();
  }, []);
}
