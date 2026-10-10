import { useCallback, useEffect, useState } from 'react';
import type { WalletInterface } from '@bsv/sdk';
import { listHandles, type HeldHandle } from '../services/handles';

/** The BRC-169 handle certificates held in the wallet, with decrypted fields. */
export const useHandles = (wallet: WalletInterface) => {
  const [handles, setHandles] = useState<HeldHandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHandles(await listHandles(wallet));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { handles, loading, error, refresh };
};
