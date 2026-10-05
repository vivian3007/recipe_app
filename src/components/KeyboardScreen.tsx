import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';

/**
 * Pushes its content up when the keyboard opens, on iOS and Android.
 *
 * Android draws edge-to-edge, so the window no longer shrinks for the keyboard by itself.
 * KeyboardAvoidingView needs to know where it sits on screen (below a header, inside a
 * modal sheet), so we measure that instead of guessing a fixed offset.
 */
export function KeyboardScreen({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState(0);

  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={() => ref.current?.measureInWindow((_x, y) => setOffset(y))}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={offset}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
