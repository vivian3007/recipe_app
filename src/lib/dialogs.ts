import { Alert, Platform } from 'react-native';

// Alert does nothing in the web version, so on the web the browser's own dialogs are used.

/** Shows a message, e.g. that saving failed. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/**
 * Asks to pick one of several options; resolves to its index, or null when cancelled.
 * The browser can only ask yes/no, so on the web each option is asked in turn.
 */
export function choose(
  title: string,
  message: string | undefined,
  options: { text: string; destructive?: boolean }[],
): Promise<number | null> {
  if (Platform.OS === 'web') {
    const intro = message ? `${title}\n\n${message}` : title;
    const index = options.findIndex((o) =>
      window.confirm(options.length > 1 ? `${intro}\n\n${o.text}?` : intro),
    );
    return Promise.resolve(index === -1 ? null : index);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Annuleren', style: 'cancel', onPress: () => resolve(null) },
        ...options.map((o, i) => ({
          text: o.text,
          style: o.destructive ? ('destructive' as const) : ('default' as const),
          onPress: () => resolve(i),
        })),
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** Asks a yes/no question. */
export async function confirm(title: string, message: string | undefined, okText: string, destructive = false) {
  return (await choose(title, message, [{ text: okText, destructive }])) === 0;
}
