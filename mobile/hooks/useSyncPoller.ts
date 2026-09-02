import { useEffect } from 'react';
import { POLL_INTERVAL_MS } from '@/constants/config';
import { api } from '@/services/api';
import type { SyncResponse } from '@/types';

export function useSyncPoller(
  sinceVersion: number,
  onSync: (response: SyncResponse) => void
) {
  useEffect(() => {
    const poll = async () => {
      const response = await api.getSync(sinceVersion);
      const hasEvents =
        response.products.length > 0 ||
        response.categories.length > 0 ||
        response.tags.length > 0;
      if (hasEvents) onSync(response);
    };

    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }, [sinceVersion]);
}
