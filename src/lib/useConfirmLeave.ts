import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

import { confirm } from './dialogs';

const TITLE = 'Wijzigingen niet opgeslagen';
const MESSAGE = 'Je hebt dingen veranderd die nog niet zijn opgeslagen. Weet je zeker dat je weg wilt gaan?';

/** Asks before leaving a screen with unsaved changes (back button, swipe, closing the modal). */
export function useConfirmLeave(hasChanges: boolean) {
  const navigation = useNavigation();

  usePreventRemove(hasChanges, async ({ data }) => {
    if (await confirm(TITLE, MESSAGE, 'Niet opslaan', true)) navigation.dispatch(data.action);
  });
}
