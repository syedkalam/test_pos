import { Platform } from 'react-native';

// Android emulators can't reach the host machine via `localhost` — that
// resolves to the emulator itself. `10.0.2.2` is the documented alias for
// the host loopback interface. iOS simulators share the host's network, so
// `localhost` works there unchanged.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_URL = `http://${HOST}:8080`;
export const WS_URL = `ws://${HOST}:8080`;
export const POLL_INTERVAL_MS = 5000;
export const PAGE_SIZE = 50;
