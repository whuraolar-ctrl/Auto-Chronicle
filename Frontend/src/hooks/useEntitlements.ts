import { useCallback, useEffect, useState } from 'react';
import {
  fetchEntitlements,
  type Entitlements,
} from '../services/billing';
import { getAccessToken } from '../services/api';

const DEFAULT: Entitlements = {
  plan: 'free',
  planName: 'Free',
  status: 'free',
  maxVehicles: 1,
  canUseFleet: false,
  canInviteDrivers: false,
  canExport: false,
  isPaid: false,
};

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<Entitlements>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setEntitlements(DEFAULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchEntitlements();
      setEntitlements(data);
      setError(null);
    } catch {
      setError('Could not load plan limits');
      setEntitlements(DEFAULT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entitlements, loading, error, refresh };
}
