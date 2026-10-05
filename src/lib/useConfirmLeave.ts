import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert, Platform } from 'react-native';

const TITLE = 'Wijzigingen niet opgeslagen';
const MESSAGE = 'Je hebt dingen veranderd die nog niet zijn opgeslagen. Weet je zeker dat je weg wilt gaan?';

/** Asks before leaving a screen with unsaved changes (back button, swipe, closing the modal). */
export function useConfirmLeave(hasChanges: boolean) {
  const navigation = useNavigation();

  usePreventRemove(hasChanges, ({ data }) => {
    // Alert does nothing on the web, so use the browser's own dialog there.
    if (Platform.OS === 'web') {
      if (window.confirm(`${TITLE}\n\n${MESSAGE}`)) navigation.dispatch(data.action);
      return;
    }
    Alert.alert(TITLE, MESSAGE, [
      { text: 'Blijven', style: 'cancel' },
      { text: 'Niet opslaan', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
