import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '../components/Button';
import { PageLoader } from '../components/PageLoader';
import { ProviderPicker, KNOWN_PROVIDERS } from '../components/ProviderPicker';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
import { useRemoteStatus, type RemoteStatus } from '../hooks/useRemoteStatus';
import { fetchExchangeRate } from '../utils/wallet';

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageConfig {
  activeRemote?: string;
  remotes?: string[];
}

interface SyncStateInfo {
  storageIdentityKey: string;
  storageName: string;
  status: string;
  when?: string;
}

interface StorageInfo {
  storageIdentityKey: string;
  outputCount: number;
  transactionCount: number;
  syncStates: SyncStateInfo[];
  storageConfig: StorageConfig;
}

// Re-export for use in UI rendering
type RemoteUsage = RemoteStatus;

export interface StorageStatusProps {
  onBack: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

function usageBarColor(pct: number): string {
  if (pct >= 90) return '#F97066';
  if (pct >= 70) return '#FDB022';
  return '#34D399';
}

function syncStatusLabel(syncStates: SyncStateInfo[], url: string): { label: string; color: string } | null {
  const state = syncStates.find((s) => s.storageName?.includes(url) || s.storageIdentityKey?.includes(url));
  if (!state) return null;
  switch (state.status) {
    case 'synced':
      return { label: 'Synced', color: '#34D399' };
    case 'error':
      return { label: 'Error', color: '#F97066' };
    default:
      return { label: state.status, color: '#98A2B3' };
  }
}

// ── Sub-views ──────────────────────────────────────────────────────────────

type SubView = { type: 'main' } | { type: 'detail'; url: string; isLocal: boolean };

// ── Component ──────────────────────────────────────────────────────────────

function formatRate(pricing: RemoteUsage['pricing'], exchangeRate: number): string {
  const unitGb = pricing.purchaseUnitBytes / 1_073_741_824;
  const label = unitGb >= 1 ? `${unitGb} GB` : `${Math.round(unitGb * 1024)} MB`;
  if (!exchangeRate || exchangeRate <= 0) {
    return `${pricing.satsPerUnit.toLocaleString()} sats/${label}/mo`;
  }
  const usd = ((pricing.satsPerUnit / 100_000_000) * exchangeRate).toFixed(2);
  return `$${usd}/${label}/mo`;
}

export const StorageStatus = ({ onBack }: StorageStatusProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { apiContext } = useServiceContext();
  const [exchangeRate, setExchangeRate] = useState(0);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [localUsage, setLocalUsage] = useState<{ used: number; quota: number } | null>(null);
  const remotes = info?.storageConfig?.remotes ?? [];
  const remotesKey = remotes.join(',');
  const stableRemotes = useMemo(() => remotes, [remotesKey]);
  const stableKnownUrls = useMemo(() => KNOWN_PROVIDERS.map((p) => p.url), []);
  const { statusMap, loading: statusLoading } = useRemoteStatus(
    apiContext.wallet as any,
    stableRemotes,
    stableKnownUrls,
  );
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'active' | 'remove' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [subView, _setSubView] = useState<SubView>({ type: 'main' });
  const containerRef = useRef<HTMLDivElement>(null);
  const setSubView = (view: SubView) => {
    _setSubView(view);
    // Scroll the parent scrollable container to top on view change
    requestAnimationFrame(() => {
      containerRef.current?.closest('[style*="overflow"]')?.scrollTo(0, 0);
    });
  };

  // Intercept the parent's back navigation when in detail view
  const handleBack = () => {
    if (subView.type === 'detail') {
      setSubView({ type: 'main' });
    } else {
      onBack();
    }
  };

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

  const fetchInfo = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET_INFO' });
      if (response?.success) setInfo(response.data);
    } catch {
      // Wallet may not be ready yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
    fetchExchangeRate(apiContext.chain, apiContext.wocApiKey)
      .then(setExchangeRate)
      .catch(() => {});
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => {
          if (est.usage !== undefined && est.quota !== undefined) {
            setLocalUsage({ used: est.usage, quota: est.quota });
          }
        })
        .catch(() => {});
    }
  }, [apiContext]);

  const runAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    try {
      const response = await chrome.runtime.sendMessage({ action, ...payload });
      if (response?.success) {
        addSnackbar(successMessage, 'success');
        await fetchInfo();
      } else {
        addSnackbar(response?.error || 'Action failed', 'error');
      }
    } catch (error) {
      addSnackbar(error instanceof Error ? error.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({ action: 'STORAGE_SYNC_BACKUPS' }),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'Sync timed out' }), 30000),
        ),
      ]);
      if (response?.success) {
        addSnackbar('Sync complete', 'success');
        await fetchInfo();
      } else {
        addSnackbar(response?.error || 'Sync failed', 'error');
      }
    } catch {
      // Sync failed silently
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = () => {
    if (!syncing) triggerSync();
  };

  const handleSetActive = async (target: 'local' | string) => {
    setBusyAction('active');
    await runAction(
      'STORAGE_SET_ACTIVE_STORAGE',
      { target },
      target === 'local' ? 'Switched to local' : `Active: ${hostFromUrl(target)}`,
    );
    setBusyAction(null);
  };

  const handleAddRemote = async (url: string) => {
    await runAction('STORAGE_ADD_REMOTE', { url }, 'Remote added');
    setShowProviderPicker(false);
    // Auto-sync after adding a new remote
    triggerSync();
  };

  const handleRemoveRemote = async (url: string) => {
    setBusyAction('remove');
    await runAction('STORAGE_REMOVE_REMOTE', { url }, 'Remote removed');
    setBusyAction(null);
    setSubView({ type: 'main' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center w-full py-2">
        <PageLoader theme={theme} message="Loading storage info..." />
      </div>
    );
  }

  const storageConfig = info?.storageConfig ?? {};
  const activeRemote = storageConfig.activeRemote;
  const localIsActive = !activeRemote;
  const syncStates = info?.syncStates ?? [];

  // ── Detail view for a single store ─────────────────────────────────────

  if (subView.type === 'detail') {
    const { url, isLocal } = subView;
    const isActive = isLocal ? localIsActive : activeRemote === url;
    const remoteResult = isLocal ? null : statusMap[url];
    const usage: RemoteUsage | null = remoteResult?.status === 'ok' ? remoteResult.data : null;
    const pct = usage ? usagePercent(usage.usedBytes, usage.capacityBytes) : 0;
    const barColor = usageBarColor(pct);
    const sync = isLocal ? null : syncStatusLabel(syncStates, url);

    return (
      <div ref={containerRef} className="flex flex-col w-full py-2 pb-20 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 w-full">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setSubView({ type: 'main' })}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border-0 outline-none cursor-pointer"
            style={{ backgroundColor: '#17191E', border: '1px solid rgba(152,162,179,0.15)' }}
          >
            <ChevronLeft size={18} color="#FFFFFF" />
          </motion.button>
          <h2 className="text-base font-bold" style={{ color: '#FFFFFF' }}>
            {isLocal ? 'Local Storage' : hostFromUrl(url)}
          </h2>
        </div>

        {/* Header card */}
        <div
          className="w-full rounded-xl p-4 bg-[#17191E]"
          style={{ border: isActive ? '1px solid rgba(52,211,153,0.15)' : `1px solid ${gray}15` }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            {isLocal ? (
              <HardDrive size={20} style={{ color: isActive ? '#34D399' : gray }} />
            ) : (
              <Server size={20} style={{ color: isActive ? '#34D399' : gray }} />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: contrast }}>
                  {isLocal ? 'Local Storage' : hostFromUrl(url)}
                </p>
                <span
                  className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
                  style={{
                    color: isActive ? '#34D399' : '#667085',
                    background: isActive ? 'rgba(52,211,153,0.1)' : 'rgba(102,112,133,0.1)',
                  }}
                >
                  {isActive ? 'In use' : 'Backup copy'}
                </span>
                {sync && (
                  <span
                    className="text-[8px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: sync.color, background: `${sync.color}15` }}
                  >
                    {sync.label}
                  </span>
                )}
              </div>
              {!isLocal && (
                <p className="text-[9px] font-mono mt-0.5" style={{ color: gray }}>
                  {url}
                </p>
              )}
            </div>
          </div>

          {/* Usage */}
          {isLocal ? (
            localUsage ? (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: contrast }}>
                    {formatBytes(localUsage.used)}
                  </span>
                  <span className="text-[10px]" style={{ color: gray }}>
                    of {formatBytes(localUsage.quota)} available
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${usagePercent(localUsage.used, localUsage.quota)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{
                      background: usageBarColor(usagePercent(localUsage.used, localUsage.quota)),
                      minWidth: localUsage.used > 0 ? '4px' : '0',
                    }}
                  />
                </div>
                <p className="text-[9px] mt-1.5" style={{ color: gray }}>
                  Browser-managed storage. Limit set by your browser.
                </p>
              </div>
            ) : (
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold" style={{ color: contrast }}>
                  Estimating...
                </span>
                <span className="text-[10px]" style={{ color: gray }}>
                  Browser IndexedDB
                </span>
              </div>
            )
          ) : (
            usage && (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: contrast }}>
                    {formatBytes(usage.usedBytes)}
                  </span>
                  <span className="text-[10px]" style={{ color: gray }}>
                    of {formatBytes(usage.capacityBytes)}
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: barColor, minWidth: pct > 0 ? '4px' : '0' }}
                  />
                </div>
              </div>
            )
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-3">
            {!isActive && (
              <Button
                theme={theme}
                type="primary"
                label="Make Active"
                onClick={() => handleSetActive(isLocal ? 'local' : url)}
                disabled={busy}
                loading={busyAction === 'active'}
              />
            )}
            {!isLocal && !isActive && (
              <Button
                theme={theme}
                type="warn"
                label="Remove"
                onClick={() => handleRemoveRemote(url)}
                disabled={busy}
                loading={busyAction === 'remove'}
              />
            )}
            {isActive && !isLocal && (
              <p className="text-[9px] text-center" style={{ color: gray }}>
                This is your active storage. To remove it, switch to a different location first.
              </p>
            )}
          </div>
        </div>

        {/* Pricing (remote only) */}
        {!isLocal && usage && (
          <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
              Storage & Pricing
            </span>
            <div className="space-y-2 mt-2.5">
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.1)' }}
              >
                <span className="text-[11px] font-semibold" style={{ color: contrast }}>
                  Free capacity
                </span>
                <span className="text-[11px] font-semibold" style={{ color: '#34D399' }}>
                  {formatBytes(usage.baselineBytes)}
                </span>
              </div>
              {usage.paidBytes > 0 && (
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.08)' }}
                >
                  <span className="text-[11px]" style={{ color: '#D0D5DD' }}>
                    Paid capacity
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: '#34D399' }}>
                    +{formatBytes(usage.paidBytes)}
                  </span>
                </div>
              )}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span className="text-[11px]" style={{ color: '#D0D5DD' }}>
                  Additional storage
                </span>
                <span className="text-[11px] font-semibold" style={{ color: '#FDB022' }}>
                  {formatRate(usage.pricing, exchangeRate)}
                </span>
              </div>
            </div>
            {usage.deficitBytes > 0 && (
              <div
                className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(249,112,102,0.08)', border: '1px solid rgba(249,112,102,0.2)' }}
              >
                <span className="text-[10px] font-medium" style={{ color: '#F97066' }}>
                  Over capacity by {formatBytes(usage.deficitBytes)} — purchase more storage to sync
                </span>
              </div>
            )}
            <p className="text-[9px] text-center mt-2" style={{ color: gray }}>
              ~{Math.round(usage.pricing.durationBlocks / 144)} days per purchase
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center w-full py-2 pb-20 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 w-full">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ backgroundColor: '#17191E', border: '1px solid rgba(152,162,179,0.15)' }}
        >
          <ChevronLeft size={18} color="#FFFFFF" />
        </motion.button>
        <h2 className="text-base font-bold" style={{ color: '#FFFFFF' }}>
          Remote Backup
        </h2>
      </div>

      {/* How it works — contextual based on current state */}
      {localIsActive && remotes.length === 0 && (
        <div
          className="w-full rounded-xl p-4"
          style={{ background: 'rgba(253,176,34,0.05)', border: '1px solid rgba(253,176,34,0.15)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: '#FDB022' }}>
            How storage works
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <HardDrive size={12} style={{ color: '#98A2B3' }} className="shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed" style={{ color: '#D0D5DD' }}>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Active storage</span> is where your wallet reads and
                writes data. Right now that's this browser.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Server size={12} style={{ color: '#98A2B3' }} className="shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed" style={{ color: '#D0D5DD' }}>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Remote servers</span> can be added as backups
                (copies of your data) or set as active to use this wallet across multiple devices.
              </p>
            </div>
          </div>
        </div>
      )}

      {localIsActive && remotes.length > 0 && (
        <div
          className="w-full rounded-xl p-3"
          style={{ background: 'rgba(253,176,34,0.05)', border: '1px solid rgba(253,176,34,0.12)' }}
        >
          <p className="text-[10px] leading-relaxed" style={{ color: '#D0D5DD' }}>
            Your active storage is local. Remotes below are backing up your data. To use this wallet on another device,
            set a remote as active.
          </p>
        </div>
      )}

      {!localIsActive && (
        <div
          className="w-full rounded-xl p-3"
          style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.1)' }}
        >
          <p className="text-[10px] leading-relaxed" style={{ color: '#D0D5DD' }}>
            Your wallet is syncing to a remote server. You can use the same keys on another device and it will stay in
            sync.
          </p>
        </div>
      )}

      {/* Active storage summary */}
      <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: '1px solid rgba(52,211,153,0.15)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#34D399' }}>
            Active Storage
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {localIsActive ? (
                <WifiOff size={10} style={{ color: gray }} />
              ) : (
                <Wifi size={10} style={{ color: '#34D399' }} />
              )}
              <span className="text-[9px]" style={{ color: gray }}>
                {localIsActive ? 'This device only' : 'Synced across devices'}
              </span>
            </div>
            <button
              onClick={() =>
                setSubView({ type: 'detail', url: localIsActive ? '' : activeRemote!, isLocal: localIsActive })
              }
              className="flex items-center justify-center w-6 h-6 rounded border-0 outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <Pencil size={11} style={{ color: gray }} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {localIsActive ? (
            <HardDrive size={18} style={{ color: '#34D399' }} />
          ) : (
            <Server size={18} style={{ color: '#34D399' }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: contrast }}>
              {localIsActive ? 'This Browser' : hostFromUrl(activeRemote!)}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              {localIsActive
                ? 'Data lives only in this browser. Add a remote to protect it.'
                : 'All devices with your keys connect here'}
            </p>
          </div>
        </div>

        {/* Usage bar for active store */}
        {(() => {
          if (localIsActive && localUsage) {
            const pct = Math.max(usagePercent(localUsage.used, localUsage.quota), localUsage.used > 0 ? 1 : 0);
            return (
              <div className="mt-3">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] font-semibold" style={{ color: contrast }}>
                    {formatBytes(localUsage.used)}
                  </span>
                  <span className="text-[9px]" style={{ color: gray }}>
                    of {formatBytes(localUsage.quota)}
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: usageBarColor(pct), minWidth: pct > 0 ? '6px' : '0' }}
                  />
                </div>
              </div>
            );
          }
          if (!localIsActive && activeRemote) {
            const result = statusMap[activeRemote];
            if (result?.status === 'ok') {
              const usage = result.data;
              const pct = Math.max(usagePercent(usage.usedBytes, usage.capacityBytes), usage.usedBytes > 0 ? 1 : 0);
              return (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: contrast }}>
                      {formatBytes(usage.usedBytes)}
                    </span>
                    <span className="text-[9px]" style={{ color: gray }}>
                      of {formatBytes(usage.capacityBytes)}
                    </span>
                  </div>
                  <div
                    className="w-full h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: usageBarColor(pct), minWidth: pct > 0 ? '6px' : '0' }}
                    />
                  </div>
                </div>
              );
            }
          }
          return null;
        })()}

        {/* Stats */}
        <div className="flex mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex-1 text-center">
            <p className="text-base font-bold" style={{ color: contrast }}>
              {info?.outputCount?.toLocaleString() ?? '0'}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              Outputs
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-base font-bold" style={{ color: contrast }}>
              {info?.transactionCount?.toLocaleString() ?? '0'}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              Transactions
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-base font-bold" style={{ color: contrast }}>
              {remotes.length}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              Remotes
            </p>
          </div>
        </div>

        {/* Sync */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={syncing ? undefined : handleSync}
          disabled={syncing}
          className="flex items-center justify-center gap-2 w-full mt-3 py-2 rounded-lg text-xs font-medium border-0 outline-none cursor-pointer disabled:opacity-50"
          style={{ color: gray, background: 'rgba(255,255,255,0.04)' }}
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </motion.button>
      </div>

      {/* Backup storage */}
      {(() => {
        // Filter to only non-active items
        const backupRemotes = remotes.filter((url) => url !== activeRemote);
        const showLocalBackup = !localIsActive;
        const hasBackups = showLocalBackup || backupRemotes.length > 0;

        return (
          <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
                    Backup Storage
                  </span>
                  {syncing && <RefreshCw size={10} className="animate-spin" style={{ color: '#34D399' }} />}
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: gray }}>
                  {syncing ? 'Syncing backups...' : 'Copies of your data for safety'}
                </p>
              </div>
              <button
                onClick={() => setShowProviderPicker(true)}
                className="flex items-center gap-1 px-2 py-1 rounded border-0 outline-none cursor-pointer"
                style={{ color: '#34D399', background: 'rgba(52,211,153,0.08)' }}
              >
                <Plus size={10} />
                <span className="text-[9px] font-semibold">Add</span>
              </button>
            </div>

            {/* Local — only shown when a remote is active */}
            {showLocalBackup && (
              <StoreCard
                icon={<HardDrive size={14} />}
                label="This Browser"
                isActive={false}
                role="backup"
                usageText={
                  localUsage ? `${formatBytes(localUsage.used)} / ${formatBytes(localUsage.quota)}` : 'Estimating...'
                }
                usagePercent={
                  localUsage
                    ? Math.max(usagePercent(localUsage.used, localUsage.quota), localUsage.used > 0 ? 1 : 0)
                    : undefined
                }
                usageBarColor={localUsage ? usageBarColor(usagePercent(localUsage.used, localUsage.quota)) : undefined}
                onClick={() => setSubView({ type: 'detail', url: '', isLocal: true })}
                contrast={contrast}
                gray={gray}
              />
            )}

            {/* Non-active remotes */}
            {backupRemotes.map((url) => {
              const result = statusMap[url];
              const sync = syncStatusLabel(syncStates, url);

              if (result?.status === 'error') {
                return (
                  <StoreCard
                    key={url}
                    icon={<Server size={14} />}
                    label={hostFromUrl(url)}
                    isActive={false}
                    role="backup"
                    usageText="Unreachable"
                    syncStatus={{ label: 'Offline', color: '#F97066' }}
                    onClick={() => setSubView({ type: 'detail', url, isLocal: false })}
                    contrast={contrast}
                    gray={gray}
                  />
                );
              }

              if (result?.status === 'live') {
                return (
                  <StoreCard
                    key={url}
                    icon={<Server size={14} />}
                    label={hostFromUrl(url)}
                    isActive={false}
                    role="backup"
                    usageText="Connected"
                    syncStatus={sync ?? { label: 'Online', color: '#34D399' }}
                    onClick={() => setSubView({ type: 'detail', url, isLocal: false })}
                    contrast={contrast}
                    gray={gray}
                  />
                );
              }

              if (!result || result.status !== 'ok') {
                return (
                  <StoreCard
                    key={url}
                    icon={<Server size={14} />}
                    label={hostFromUrl(url)}
                    isActive={false}
                    role="backup"
                    usageText={statusLoading ? 'Loading...' : 'Connected'}
                    syncStatus={sync}
                    onClick={() => setSubView({ type: 'detail', url, isLocal: false })}
                    contrast={contrast}
                    gray={gray}
                  />
                );
              }

              const usage = result.data;
              const pct = usagePercent(usage.usedBytes, usage.capacityBytes);
              const barColor = usageBarColor(pct);

              return (
                <StoreCard
                  key={url}
                  icon={<Server size={14} />}
                  label={hostFromUrl(url)}
                  isActive={false}
                  role="backup"
                  usageText={`${formatBytes(usage.usedBytes)} / ${formatBytes(usage.capacityBytes)}`}
                  usagePercent={pct}
                  usageBarColor={barColor}
                  syncStatus={sync}
                  onClick={() => setSubView({ type: 'detail', url, isLocal: false })}
                  contrast={contrast}
                  gray={gray}
                />
              );
            })}

            {!hasBackups && (
              <p className="text-[10px] mt-2 text-center" style={{ color: gray }}>
                Add a remote server to back up your data or use your wallet on multiple devices.
              </p>
            )}
          </div>
        );
      })()}

      {/* Provider picker overlay */}
      {showProviderPicker && (
        <ProviderPicker
          theme={theme}
          wallet={apiContext.wallet as any}
          existingRemotes={remotes}
          exchangeRate={exchangeRate}
          onSelectProvider={handleAddRemote}
          onClose={() => setShowProviderPicker(false)}
          busy={busy}
        />
      )}

      {/* Advanced */}
      <motion.button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center justify-center gap-1 w-full py-2 border-0 outline-none cursor-pointer bg-transparent"
        style={{ color: gray }}
      >
        <span className="text-[10px] font-medium">Advanced</span>
        {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </motion.button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full overflow-hidden"
          >
            <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
              <p className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: gray }}>
                Storage Identity Key
              </p>
              <p className="text-[10px] break-all font-mono" style={{ color: contrast }}>
                {info?.storageIdentityKey ?? '—'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── StoreCard (tappable, with usage bar) ───────────────────────────────────

interface StoreCardProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  role: 'active' | 'backup' | 'available';
  usageText: string;
  usagePercent?: number;
  usageBarColor?: string;
  syncStatus?: { label: string; color: string } | null;
  onClick: () => void;
  contrast: string;
  gray: string;
}

const StoreCard = ({
  icon,
  label,
  isActive,
  role,
  usageText,
  usagePercent: pct,
  usageBarColor: barColor,
  syncStatus,
  onClick,
  contrast,
  gray,
}: StoreCardProps) => {
  const roleColor = role === 'active' ? '#34D399' : '#667085';

  return (
    <button
      onClick={onClick}
      className="flex items-center w-full px-3 py-3 rounded-lg my-1 border-0 outline-none cursor-pointer text-left"
      style={{
        background: isActive ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.02)',
        border: isActive ? '1px solid rgba(52,211,153,0.15)' : '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div className="shrink-0" style={{ color: isActive ? '#34D399' : gray }}>
        {icon}
      </div>
      <div className="ml-2 flex-1 min-w-0">
        {/* Top row: name + badges */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate" style={{ color: contrast }}>
            {label}
          </span>
          <span
            className="text-[7px] font-semibold uppercase px-1 py-0.5 rounded shrink-0"
            style={{ color: roleColor, background: `${roleColor}15` }}
          >
            {role === 'active' ? 'In use' : role === 'backup' ? 'Backup copy' : ''}
          </span>
          {syncStatus && (
            <span
              className="text-[7px] font-semibold px-1 py-0.5 rounded shrink-0"
              style={{ color: syncStatus.color, background: `${syncStatus.color}15` }}
            >
              {syncStatus.label}
            </span>
          )}
        </div>

        {/* Usage bar + text */}
        <div className="flex items-center gap-2">
          {pct !== undefined && barColor && (
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)', maxWidth: '80px' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`,
                  background: barColor,
                  minWidth: pct > 0 ? '6px' : '0',
                }}
              />
            </div>
          )}
          <span className="text-[9px]" style={{ color: gray }}>
            {usageText}
          </span>
        </div>
      </div>

      <ChevronRight size={14} style={{ color: gray }} className="shrink-0 ml-1" />
    </button>
  );
};
