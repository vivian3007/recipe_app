import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

type Callbacks = {
  onStart: (pageY: number) => void;
  onMove: (pageY: number) => void;
  onEnd: (dropped: boolean) => void;
};

/** Grip that starts dragging as soon as you touch it (so it doesn't fight with scrolling). */
export function DragHandle(props: Callbacks) {
  // The responder is created once; it always calls the latest callbacks.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // The handlers read `latest` only when a gesture happens, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => latest.current.onStart(e.nativeEvent.pageY),
      onPanResponderMove: (_, g) => latest.current.onMove(g.moveY),
      onPanResponderRelease: () => latest.current.onEnd(true),
      onPanResponderTerminate: () => latest.current.onEnd(false),
    }),
  );

  return (
    <View {...responder.panHandlers} style={styles.handle} accessibilityLabel="Slepen om te verplaatsen" hitSlop={8}>
      <Ionicons name="reorder-three" size={26} color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
});
