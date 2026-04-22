import { useCallback, useEffect, useState } from 'react';
import { AuthFetch } from '@bsv/sdk';
import type { WalletInterface } from '@bsv/sdk';

export interface RemotePricing {
  purchaseUnitBytes: number;
  satsPerUnit: number;
  durationBlocks: number;
}

export interface RemoteStatus {
  identityKey: string;
  serverIdentityKey: string;
  accountsEnabled: boolean;
  currentBlock: number;
  usedBytes: number;
  baselineBytes: number;
  paidBytes: number;
  capacityBytes: number;
  deficitBytes: number;
  paidThroughBlock: number | null;
  pricing: RemotePricing;
  nextPayment: {
    derivationPrefix: string;
    derivationSuffix: string;
  };
}

export type RemoteStatusResult =
  | { status: 'ok'; data: RemoteStatus }
  | { status: 'live' }
  | { status: 'error'; error: string };

/**
 * Fetch status from all configured remotes in parallel.
 * - Known provider URLs: AuthFetch to /account/status for full usage data
 * - Custom URLs: AuthFetch to base URL as a liveness check (BRC-103 handshake)
 */
export const useRemoteStatus = (wallet: WalletInterface | undefined, remotes: string[], knownUrls: string[]) => {
  const [statusMap, setStatusMap] = useState<Record<string, RemoteStatusResult>>({});
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!wallet || remotes.length === 0) {
      setStatusMap({});
      return;
    }

    setLoading(true);
    const authFetch = new AuthFetch(wallet);

    const results = await Promise.all(
      remotes.map(async (url): Promise<[string, RemoteStatusResult]> => {
        const isKnown = knownUrls.includes(url);

        if (isKnown) {
          // Known provider: fetch /account/status for full usage data
          try {
            const statusUrl = `${url.replace(/\/$/, '')}/account/status`;
            const response = await authFetch.fetch(statusUrl, { method: 'GET' });
            if (!response.ok) {
              return [url, { status: 'error', error: `HTTP ${response.status}` }];
            }
            const data = (await response.json()) as RemoteStatus;
            return [url, { status: 'ok', data }];
          } catch (err) {
            return [url, { status: 'error', error: err instanceof Error ? err.message : 'Unreachable' }];
          }
        } else {
          // Custom remote: simple connectivity check (any HTTP response = live)
          try {
            const origin = new URL(url).origin;
            const res = await fetch(origin, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            return [url, res ? { status: 'live' } : { status: 'error', error: 'Unreachable' }];
          } catch {
            // HEAD failed, try GET
            try {
              const origin = new URL(url).origin;
              await fetch(origin, { method: 'GET', signal: AbortSignal.timeout(5000) });
              return [url, { status: 'live' }];
            } catch {
              return [url, { status: 'error', error: 'Unreachable' }];
            }
          }
        }
      }),
    );

    setStatusMap(Object.fromEntries(results));
    setLoading(false);
  }, [wallet, remotes, knownUrls]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { statusMap, loading, refetch: fetchAll };
};
