import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  HardDrive,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '../components/Button';
import { PageLoader } from '../components/PageLoader';
import { ProviderPicker } from '../components/ProviderPicker';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
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

// TODO: Will come from each provider's GET /status endpoint
interface RemoteTier {
  name: string;
  storage: string;
  /** Monthly price in satoshis. 0 = free. Set by the server. */
  priceInSats: number;
  description: string;
}

interface RemoteUsage {
  usedBytes: number;
  totalBytes: number; // -1 = unlimited
  tier: string;
  tiers: RemoteTier[];
  paymentAddress: string;
}

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

// TODO: Fetch real usage from each remote's GET /status endpoint.
// Stubbed per-store usage for now.
function getRemoteUsage(_url: string): RemoteUsage {
  return {
    usedBytes: 0,
    totalBytes: 1_073_741_824, // 1 GB
    tier: 'free',
    paymentAddress: '1YoursStoragePaymentAddressXXXXXXXXX', // TODO: real address from GET /status
    tiers: [
      { name: 'Free', storage: '1 GB', priceInSats: 0, description: 'Auto-backup included' },
      { name: 'Pro', storage: '10 GB', priceInSats: 6_250_000, description: 'For power users' },
      { name: 'Unlimited', storage: 'Unlimited', priceInSats: 31_250_000, description: 'No limits' },
    ],
  };
}

// ── Sub-views ──────────────────────────────────────────────────────────────

type SubView = { type: 'main' } | { type: 'detail'; url: string; isLocal: boolean };

// ── Component ──────────────────────────────────────────────────────────────

function formatTierPrice(sats: number, exchangeRate: number): string {
  if (sats === 0) return 'Free';
  if (!exchangeRate || exchangeRate <= 0) return `${sats.toLocaleString()} sats/mo`;
  const usd = ((sats / 100_000_000) * exchangeRate).toFixed(2);
  return `$${usd}/mo`;
}

export const StorageStatus = ({ onBack }: StorageStatusProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { apiContext } = useServiceContext();
  const [exchangeRate, setExchangeRate] = useState(0);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPlanTier, setSelectedPlanTier] = useState<string | null>(null);
  const [subView, _setSubView] = useState<SubView>({ type: 'main' });
  const containerRef = useRef<HTMLDivElement>(null);
  const setSubView = (view: SubView) => {
    _setSubView(view);
    setSelectedPlanTier(null);
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

  const handleSync = () => runAction('STORAGE_SYNC_BACKUPS', {}, 'Sync complete');

  const handleSetActive = (target: 'local' | string) =>
    runAction(
      'STORAGE_SET_ACTIVE_STORAGE',
      { target },
      target === 'local' ? 'Switched to local' : `Active: ${hostFromUrl(target)}`,
    );

  const handleAddRemote = async (url: string) => {
    await runAction('STORAGE_ADD_REMOTE', { url }, 'Remote added');
    setShowProviderPicker(false);
  };

  const handleRemoveRemote = async (url: string) => {
    await runAction('STORAGE_REMOVE_REMOTE', { url }, 'Remote removed');
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
  const remotes = storageConfig.remotes ?? [];
  const activeRemote = storageConfig.activeRemote;
  const localIsActive = !activeRemote;
  const syncStates = info?.syncStates ?? [];

  // ── Detail view for a single store ─────────────────────────────────────

  if (subView.type === 'detail') {
    const { url, isLocal } = subView;
    const isActive = isLocal ? localIsActive : activeRemote === url;
    const usage = isLocal ? null : getRemoteUsage(url);
    const pct = usage ? usagePercent(usage.usedBytes, usage.totalBytes) : 0;
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
                  {isActive ? 'Active' : 'Backup'}
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

          {/* Usage bar */}
          {isLocal ? (
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold" style={{ color: contrast }}>
                Unlimited
              </span>
              <span className="text-[10px]" style={{ color: gray }}>
                Browser IndexedDB
              </span>
            </div>
          ) : (
            usage && (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: contrast }}>
                    {formatBytes(usage.usedBytes)}
                  </span>
                  <span className="text-[10px]" style={{ color: gray }}>
                    {usage.totalBytes < 0 ? 'Unlimited' : `of ${formatBytes(usage.totalBytes)}`}
                  </span>
                </div>
                {usage.totalBytes > 0 && (
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
                )}
              </div>
            )
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            {!isActive && (
              <Button
                theme={theme}
                type="primary"
                label="Set as Active"
                onClick={() => handleSetActive(isLocal ? 'local' : url)}
                disabled={busy}
                loading={busy}
              />
            )}
            {!isLocal && !isActive && (
              <Button
                theme={theme}
                type="warn"
                label="Remove"
                onClick={() => handleRemoveRemote(url)}
                disabled={busy}
                loading={busy}
              />
            )}
          </div>
        </div>

        {/* Plans (remote only) */}
        {!isLocal &&
          usage &&
          (() => {
            const currentIndex = usage.tiers.findIndex((t) => t.name.toLowerCase() === usage.tier);
            const selectedIndex = selectedPlanTier ? usage.tiers.findIndex((t) => t.name === selectedPlanTier) : -1;
            const hasSelection = selectedPlanTier && selectedPlanTier !== usage.tiers[currentIndex]?.name;
            const isUpgrade = hasSelection && selectedIndex > currentIndex;
            const isDowngrade = hasSelection && selectedIndex < currentIndex;

            return (
              <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
                    Plan
                  </span>
                  <span
                    className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                    style={{ color: '#34D399', background: 'rgba(52,211,153,0.1)' }}
                  >
                    Current: {usage.tiers[currentIndex]?.name ?? usage.tier}
                  </span>
                </div>

                <div className="space-y-1.5 mt-3">
                  {usage.tiers.map((tier) => {
                    const isCurrent = tier.name.toLowerCase() === usage.tier;
                    const isSelected = selectedPlanTier === tier.name;
                    const highlighted = isSelected || (isCurrent && !selectedPlanTier);
                    return (
                      <button
                        key={tier.name}
                        onClick={() => {
                          if (isCurrent) {
                            setSelectedPlanTier(null);
                          } else {
                            setSelectedPlanTier(isSelected ? null : tier.name);
                          }
                        }}
                        className="flex items-center w-full px-3 py-2.5 rounded-lg border-0 outline-none cursor-pointer text-left"
                        style={{
                          background: highlighted ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.02)',
                          border: highlighted ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        {highlighted ? (
                          <Check size={14} style={{ color: '#34D399' }} className="shrink-0" />
                        ) : (
                          <Shield
                            size={14}
                            style={{ color: tier.priceInSats === 0 ? '#667085' : '#FDB022' }}
                            className="shrink-0"
                          />
                        )}
                        <div className="ml-2 flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] font-semibold" style={{ color: contrast }}>
                              {tier.name}
                            </span>
                            <span className="text-[9px]" style={{ color: gray }}>
                              {tier.storage}
                            </span>
                            {isCurrent && (
                              <span
                                className="text-[7px] font-semibold uppercase px-1 py-0.5 rounded shrink-0"
                                style={{ color: '#34D399', background: 'rgba(52,211,153,0.1)' }}
                              >
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-[9px]" style={{ color: gray }}>
                            {tier.description}
                          </p>
                        </div>
                        <span
                          className="text-[10px] font-semibold shrink-0 ml-2"
                          style={{ color: tier.priceInSats === 0 ? '#34D399' : '#FDB022' }}
                        >
                          {formatTierPrice(tier.priceInSats, exchangeRate)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Change plan button */}
                {hasSelection && (
                  <div className="mt-3">
                    <Button
                      theme={theme}
                      type="primary"
                      label={
                        busy
                          ? 'Processing…'
                          : isUpgrade
                            ? `Upgrade to ${selectedPlanTier}`
                            : isDowngrade
                              ? `Downgrade to ${selectedPlanTier}`
                              : `Switch to ${selectedPlanTier}`
                      }
                      onClick={() => {
                        // TODO: Implement plan change via POST /pay
                        addSnackbar('Plan changes coming soon', 'info');
                      }}
                      loading={busy}
                    />
                    <p className="text-[9px] text-center mt-1.5" style={{ color: gray }}>
                      {isUpgrade ? 'Upgrade' : 'Downgrade'} paid via BSV from your wallet
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
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

      {/* Explainer */}
      <p className="text-[10px] leading-relaxed" style={{ color: gray }}>
        Your wallet data is stored in one active location and can be backed up to additional remotes. Set a remote as
        active to sync across multiple devices. Backups replicate your data for safety.
      </p>

      {/* Active storage summary */}
      <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: '1px solid rgba(52,211,153,0.15)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#34D399' }}>
            Active Storage
          </span>
          <div className="flex items-center gap-1">
            {localIsActive ? (
              <WifiOff size={10} style={{ color: gray }} />
            ) : (
              <Wifi size={10} style={{ color: '#34D399' }} />
            )}
            <span className="text-[9px]" style={{ color: gray }}>
              {localIsActive ? 'Local only' : 'Multi-device sync'}
            </span>
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
              {localIsActive ? 'Local Storage' : hostFromUrl(activeRemote!)}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              {localIsActive ? 'Browser only — not synced across devices' : 'All devices sync here'}
            </p>
          </div>
        </div>

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
          onClick={busy ? undefined : handleSync}
          disabled={busy}
          className="flex items-center justify-center gap-2 w-full mt-3 py-2 rounded-lg text-xs font-medium border-0 outline-none cursor-pointer disabled:opacity-50"
          style={{ color: gray, background: 'rgba(255,255,255,0.04)' }}
        >
          <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
          Sync Now
        </motion.button>
      </div>

      {/* Storage locations */}
      <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
              Storage Locations
            </span>
            <p className="text-[9px] mt-0.5" style={{ color: gray }}>
              Tap a location to view details, usage, or change your plan
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

        {/* Local */}
        <StoreCard
          icon={<HardDrive size={14} />}
          label="Local"
          isActive={localIsActive}
          role={localIsActive ? 'active' : 'available'}
          usageText="Unlimited"
          onClick={() => setSubView({ type: 'detail', url: '', isLocal: true })}
          contrast={contrast}
          gray={gray}
        />

        {/* All remotes */}
        {remotes.map((url) => {
          const isActive = activeRemote === url;
          const usage = getRemoteUsage(url);
          const pct = usagePercent(usage.usedBytes, usage.totalBytes);
          const barColor = usageBarColor(pct);
          const sync = syncStatusLabel(syncStates, url);

          return (
            <StoreCard
              key={url}
              icon={<Server size={14} />}
              label={hostFromUrl(url)}
              isActive={isActive}
              role={isActive ? 'active' : 'backup'}
              usageText={
                usage.totalBytes < 0
                  ? 'Unlimited'
                  : `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.totalBytes)}`
              }
              usagePercent={usage.totalBytes > 0 ? pct : undefined}
              usageBarColor={barColor}
              syncStatus={sync}
              tierLabel={usage.tier}
              onClick={() => setSubView({ type: 'detail', url, isLocal: false })}
              contrast={contrast}
              gray={gray}
            />
          );
        })}

        {remotes.length === 0 && (
          <p className="text-[10px] mt-2 text-center" style={{ color: gray }}>
            No remotes configured. Add one to enable multi-device sync and backup.
          </p>
        )}
      </div>

      {/* Provider picker overlay */}
      {showProviderPicker && (
        <ProviderPicker
          theme={theme}
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
  tierLabel?: string;
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
  tierLabel,
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
            {role === 'active' ? 'Active' : role === 'backup' ? 'Backup' : ''}
          </span>
          {tierLabel && (
            <span
              className="text-[7px] font-semibold uppercase px-1 py-0.5 rounded shrink-0"
              style={{ color: '#FDB022', background: 'rgba(253,176,34,0.1)' }}
            >
              {tierLabel}
            </span>
          )}
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
                style={{ width: `${pct}%`, background: barColor, minWidth: pct > 0 ? '2px' : '0' }}
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
