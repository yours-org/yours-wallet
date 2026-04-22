import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, ChevronDown, ChevronUp, Loader2, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Theme } from '../theme.types';
import { AuthFetch } from '@bsv/sdk';
import type { WalletInterface } from '@bsv/sdk';
import type { RemoteStatus, RemoteStatusResult } from '../hooks/useRemoteStatus';

// ── Types ──────────────────────────────────────────────────────────────────

// Known providers only need identity + URL. Pricing comes from the server.
interface StorageProvider {
  id: string;
  name: string;
  url: string;
  description: string;
}

// TODO: Move to a JSON file in the repo so providers can add themselves via PR
export const KNOWN_PROVIDERS: StorageProvider[] = [
  {
    id: 'a3e8c1d2-7f4b-4e9a-b6d0-1c5f8e2a9b3d',
    name: '1Sat Storage',
    url: 'https://wallet.1sat.app',
    description: 'Official storage partner of Yours Wallet.',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatRate(pricing: RemoteStatus['pricing'], exchangeRate: number): string {
  const unitGb = pricing.purchaseUnitBytes / 1_073_741_824;
  const label = unitGb >= 1 ? `${unitGb} GB` : `${Math.round(unitGb * 1024)} MB`;
  if (!exchangeRate || exchangeRate <= 0) {
    return `${pricing.satsPerUnit.toLocaleString()} sats/${label}/mo`;
  }
  const usd = ((pricing.satsPerUnit / 100_000_000) * exchangeRate).toFixed(2);
  return `$${usd}/${label}/mo`;
}

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  theme: Theme;
  wallet: WalletInterface;
  existingRemotes: string[];
  exchangeRate: number;
  onSelectProvider: (url: string) => void;
  onClose: () => void;
  busy?: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────

export const ProviderPicker = ({
  theme,
  wallet,
  existingRemotes,
  exchangeRate,
  onSelectProvider,
  onClose,
  busy,
}: Props) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [confirmingProvider, setConfirmingProvider] = useState<{ url: string; name: string; rate: string } | null>(
    null,
  );
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');
  const [customChecking, setCustomChecking] = useState(false);
  const [customLive, setCustomLive] = useState<boolean | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, RemoteStatusResult>>({});
  const [fetching, setFetching] = useState(true);

  // Fetch /account/status from all known providers in parallel on mount
  useEffect(() => {
    const fetchAll = async () => {
      setFetching(true);
      const authFetch = new AuthFetch(wallet);
      const results = await Promise.all(
        KNOWN_PROVIDERS.map(async (p): Promise<[string, RemoteStatusResult]> => {
          try {
            const res = await authFetch.fetch(`${p.url.replace(/\/$/, '')}/account/status`, { method: 'GET' });
            if (!res.ok) return [p.url, { status: 'error', error: `HTTP ${res.status}` }];
            const data = (await res.json()) as RemoteStatus;
            return [p.url, { status: 'ok', data }];
          } catch (err) {
            return [p.url, { status: 'error', error: err instanceof Error ? err.message : 'Unreachable' }];
          }
        }),
      );
      setStatusMap(Object.fromEntries(results));
      setFetching(false);
    };
    fetchAll();
  }, [wallet]);

  /** BRC-103 liveness check via AuthFetch. The handshake to /.well-known/auth
   *  happens internally. Any response (even 405) proves the server is alive
   *  and authenticated — only a thrown error means unreachable. */
  const checkLiveness = async (baseUrl: string): Promise<boolean> => {
    const authFetch = new AuthFetch(wallet);
    try {
      await authFetch.fetch(baseUrl.replace(/\/$/, ''), { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  };

  const handleCustomAdd = async () => {
    const url = customUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setCustomError('Invalid URL');
      return;
    }
    setCustomError('');
    setCustomChecking(true);
    setCustomLive(null);

    const live = await checkLiveness(url);
    setCustomChecking(false);
    setCustomLive(live);

    if (live) {
      onSelectProvider(url);
    } else {
      setCustomError('Server is unreachable');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="w-full max-w-[400px] rounded-t-2xl flex flex-col"
          style={{
            background: '#0D0D0D',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            maxHeight: '90vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
              Add Storage Provider
            </span>
            <button onClick={onClose} className="p-1 border-0 outline-none cursor-pointer bg-transparent">
              <X size={16} style={{ color: '#98A2B3' }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-20 space-y-3">
            <p className="text-[10px]" style={{ color: '#98A2B3' }}>
              Choose a provider or enter a custom URL. Providers can be added to the wallet repo via pull request.
            </p>

            {/* Known providers */}
            {KNOWN_PROVIDERS.map((provider) => {
              const alreadyAdded = existingRemotes.includes(provider.url);
              const isExpanded = expandedProvider === provider.id;
              const result = statusMap[provider.url];
              const isLoading = fetching && !result;
              const isOffline = result?.status === 'error';
              const serverData = result?.status === 'ok' ? result.data : null;

              return (
                <div
                  key={provider.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: alreadyAdded
                      ? 'rgba(52,211,153,0.04)'
                      : isOffline
                        ? 'rgba(249,112,102,0.03)'
                        : 'rgba(255,255,255,0.03)',
                    border: alreadyAdded
                      ? '1px solid rgba(52,211,153,0.15)'
                      : isOffline
                        ? '1px solid rgba(249,112,102,0.1)'
                        : '1px solid rgba(255,255,255,0.06)',
                    opacity: isOffline ? 0.6 : 1,
                  }}
                >
                  {/* Provider header */}
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                    className="flex items-center w-full px-4 py-3 text-left border-0 outline-none cursor-pointer bg-transparent"
                  >
                    <Server
                      size={16}
                      style={{ color: isOffline ? '#F97066' : alreadyAdded ? '#34D399' : '#98A2B3' }}
                      className="shrink-0"
                    />
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: '#FFFFFF' }}>
                          {provider.name}
                        </span>
                        {alreadyAdded && (
                          <span
                            className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
                            style={{ color: '#34D399', background: 'rgba(52,211,153,0.1)' }}
                          >
                            Added
                          </span>
                        )}
                        {isOffline && (
                          <span
                            className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
                            style={{ color: '#F97066', background: 'rgba(249,112,102,0.1)' }}
                          >
                            Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: '#98A2B3' }}>
                        {provider.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {isLoading ? (
                        <Loader2 size={12} className="animate-spin" style={{ color: '#667085' }} />
                      ) : isOffline ? (
                        <WifiOff size={12} style={{ color: '#F97066' }} />
                      ) : serverData ? (
                        <span className="text-[10px] font-medium" style={{ color: '#34D399' }}>
                          {formatBytes(serverData.baselineBytes)} free
                        </span>
                      ) : null}
                      {isExpanded ? (
                        <ChevronUp size={14} style={{ color: '#667085' }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: '#667085' }} />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          {isLoading && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 size={16} className="animate-spin" style={{ color: '#667085' }} />
                            </div>
                          )}

                          {isOffline && (
                            <div className="pt-2">
                              <p className="text-[10px] text-center" style={{ color: '#F97066' }}>
                                Unable to reach this provider. It may be temporarily down.
                              </p>
                            </div>
                          )}

                          {serverData && (
                            <>
                              {/* Pricing breakdown */}
                              <div className="pt-2.5 space-y-2">
                                <div
                                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                                  style={{
                                    background: 'rgba(52,211,153,0.06)',
                                    border: '1px solid rgba(52,211,153,0.1)',
                                  }}
                                >
                                  <span className="text-[11px] font-semibold" style={{ color: '#FFFFFF' }}>
                                    Free capacity
                                  </span>
                                  <span className="text-[11px] font-semibold" style={{ color: '#34D399' }}>
                                    {formatBytes(serverData.baselineBytes)}
                                  </span>
                                </div>
                                <div
                                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                                  style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.04)',
                                  }}
                                >
                                  <span className="text-[11px]" style={{ color: '#D0D5DD' }}>
                                    Additional storage
                                  </span>
                                  <span className="text-[11px] font-semibold" style={{ color: '#FDB022' }}>
                                    {formatRate(serverData.pricing, exchangeRate)}
                                  </span>
                                </div>
                              </div>

                              {/* URL */}
                              <p className="text-[9px] font-mono" style={{ color: '#475467' }}>
                                {provider.url}
                              </p>

                              {/* Add button */}
                              {!alreadyAdded && (
                                <Button
                                  theme={theme}
                                  type="primary"
                                  label={busy ? 'Adding…' : `Add ${provider.name}`}
                                  onClick={
                                    busy
                                      ? () => {}
                                      : () => {
                                          if (serverData.pricing.satsPerUnit > 0) {
                                            setConfirmingProvider({
                                              url: provider.url,
                                              name: provider.name,
                                              rate: formatRate(serverData.pricing, exchangeRate),
                                            });
                                          } else {
                                            onSelectProvider(provider.url);
                                          }
                                        }
                                  }
                                  loading={busy}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Custom URL section */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: '#FFFFFF' }}>
                Custom Provider
              </p>
              <p className="text-[9px] mb-2.5" style={{ color: '#98A2B3' }}>
                Enter any URL that implements the storage API
              </p>
              <Input
                theme={theme}
                placeholder="https://your-server.com/storage"
                type="text"
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setCustomError('');
                }}
                value={customUrl}
              />
              {customError && (
                <p className="text-[10px] mt-1" style={{ color: '#F97066' }}>
                  {customError}
                </p>
              )}
              <div className="mt-2">
                <Button
                  theme={theme}
                  type="secondary-outline"
                  label={customChecking ? 'Checking…' : busy ? 'Adding…' : 'Add Custom Remote'}
                  onClick={busy || customChecking ? () => {} : handleCustomAdd}
                  loading={customChecking || busy}
                />
              </div>
            </div>
          </div>

          {/* Payment confirmation overlay */}
          <AnimatePresence>
            {confirmingProvider && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 rounded-t-2xl"
                style={{ background: 'rgba(13,13,13,0.97)' }}
              >
                <div className="w-full max-w-[300px] space-y-4">
                  <p className="text-sm font-semibold text-center" style={{ color: '#FFFFFF' }}>
                    Confirm paid storage
                  </p>
                  <p className="text-xs text-center leading-relaxed" style={{ color: '#98A2B3' }}>
                    Usage above the free tier on{' '}
                    <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{confirmingProvider.name}</span> is billed at{' '}
                    <span style={{ color: '#FDB022', fontWeight: 600 }}>{confirmingProvider.rate}</span>. Payments will
                    be deducted from your wallet automatically when due.
                  </p>
                  <div className="space-y-2 pt-2">
                    <Button
                      theme={theme}
                      type="primary"
                      label={busy ? 'Adding…' : 'Agree & Add'}
                      onClick={
                        busy
                          ? () => {}
                          : () => {
                              onSelectProvider(confirmingProvider.url);
                              setConfirmingProvider(null);
                            }
                      }
                      loading={busy}
                    />
                    <button
                      onClick={() => setConfirmingProvider(null)}
                      className="w-full py-2 text-xs border-0 outline-none cursor-pointer bg-transparent"
                      style={{ color: '#667085' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
