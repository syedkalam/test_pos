import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useAppState(onForeground: () => void) {
  const onForegroundRef = useRef(onForeground);

  useEffect(() => {
    onForegroundRef.current = onForeground;
  }, [onForeground]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        onForegroundRef.current();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
