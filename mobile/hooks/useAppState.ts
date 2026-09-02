import { useEffect } from 'react';
import { AppState } from 'react-native';

export function useAppState(onForeground: () => void) {
  useEffect(() => {
    AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        onForeground();
      }
    });
  }, [onForeground]);
}
