import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ChevronDown, ChevronUp, Server, Shield, Zap, ExternalLink, Check } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Show } from '../components/Show';
import { PageLoader } from '../components/PageLoader';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';

// ── Types ──────────────────────────────────────────────────────────────────

interface StoreInfo {
  storageIdentityKey: string;
  storageName: string;
  endpointURL?: string;
  isEnabled?: boolean;
}

interface SyncStateInfo {
  storageIdentityKey: string;
  storageName: string;
  status: string;
  when?: string;
}

interface StorageTier {
  id: string;
  name: string;
  storageLimitBytes: number;
  pricePerMonthSats: number;
  description?: string;
}

interface StorageInfo {
  activeStore: StoreInfo | null;
  backupStores: StoreInfo[];
  storageIdentityKey: string;
  remoteUrl?: string;
  outputCount: number;
  transactionCount: number;
  syncStates: SyncStateInfo[];
}

// TODO: Fetch from remote server's /status endpoint
interface RemoteStatus {
  provider: string;
  usedBytes: number;
  totalBytes: number;
  tier: string;
  tiers: StorageTier[];
  paymentDue: boolean;
  paymentAmount?: number;
  paymentAddress?: string;
  lastPayment?: string;
}

/**
 * Known storage providers — anyone can add theirs via PR.
 * The wallet fetches /status from each to get live pricing/availability.
 */
interface StorageProvider {
  id: string;
  name: string;
  url: string;
  description: string;
  freeTierBytes: number;
}

// TODO: Move to a JSON file in the repo so providers can add themselves via PR
const KNOWN_PROVIDERS: StorageProvider[] = [
  {
    id: 'yours',
    name: 'Yours',
    url: 'https://storage.yours.org',
    description: 'Default provider. 1 GB free, paid upgrades available.',
    freeTierBytes: 1_073_741_824,
  },
  // Example of how a third party would add themselves:
  // {
  //   id: 'example-storage',
  //   name: 'Example Storage Co',
  //   url: 'https://bsv-storage.example.com',
  //   description: 'Community-run storage node. 500 MB free.',
  //   freeTierBytes: 524_288_000,
  // },
];

export interface StorageStatusProps {
  onBack: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

function usageColor(pct: number): string {
  if (pct >= 90) return '#F97066';
  if (pct >= 70) return '#FDB022';
  return '#34D399';
}

// ── Component ──────────────────────────────────────────────────────────────

type SubPage = 'main' | 'providers';

export const StorageStatus = ({ onBack }: StorageStatusProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  const [subPage, setSubPage] = useState<SubPage>('main');

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

  // TODO: Fetch from remote server's /status endpoint
  const [remoteStatus] = useState<RemoteStatus>({
    provider: 'Yours',
    usedBytes: 0,
    totalBytes: 1_073_741_824,
    tier: 'free',
    tiers: [
      {
        id: 'free',
        name: 'Free',
        storageLimitBytes: 1_073_741_824,
        pricePerMonthSats: 0,
        description: 'Auto-backup with 1 GB included',
      },
      {
        id: 'pro',
        name: 'Pro',
        storageLimitBytes: 10_737_418_240,
        pricePerMonthSats: 5000,
        description: '10 GB for power users',
      },
      {
        id: 'unlimited',
        name: 'Unlimited',
        storageLimitBytes: -1,
        pricePerMonthSats: 25000,
        description: 'No storage limits',
      },
    ],
    paymentDue: false,
  });

  const fetchStorageInfo = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET_INFO' });
      if (response?.success) {
        setInfo(response.data);
      }
    } catch {
      // Server not available yet — UI renders with defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSyncBackups = async () => {
    setSyncing(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_SYNC_BACKUPS' });
      if (response.success) {
        addSnackbar('Backup sync complete', 'success');
        await fetchStorageInfo();
      } else {
        addSnackbar(response.error || 'Sync failed', 'error');
      }
    } catch (error) {
      addSnackbar('Sync failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleMigrate = async (url: string) => {
    if (!url.trim()) {
      addSnackbar('Enter a remote URL', 'error');
      return;
    }
    setMigrating(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_MIGRATE_REMOTE', url: url.trim() });
      if (response.success) {
        addSnackbar('Migration complete', 'success');
        setNewRemoteUrl('');
        setSubPage('main');
        await fetchStorageInfo();
      } else {
        addSnackbar(response.error || 'Migration failed', 'error');
      }
    } catch (error) {
      addSnackbar('Migration failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setMigrating(false);
    }
  };

  const handleUpgrade = (tierId: string) => {
    // TODO: Implement pay-on-access upgrade flow
    // 1. Wallet sends BSV payment to remoteStatus.paymentAddress
    // 2. POST /pay { storageIdentityKey, txid, tierId } to storage server
    // 3. Server verifies payment on-chain, provisions storage
    void tierId;
    addSnackbar('Upgrade flow coming soon', 'info');
  };

  void onBack;

  if (loading) {
    return (
      <div className="flex flex-col items-center w-full py-2">
        <PageLoader theme={theme} message="Loading storage info..." />
      </div>
    );
  }

  const pct = usagePercent(remoteStatus.usedBytes, remoteStatus.totalBytes);
  const barColor = usageColor(pct);
  const currentTier = remoteStatus.tiers.find((t) => t.id === remoteStatus.tier);
  const upgradeTiers = remoteStatus.tiers.filter(
    (t) => t.id !== remoteStatus.tier && t.pricePerMonthSats > (currentTier?.pricePerMonthSats ?? 0),
  );
  const lastSync = info?.syncStates?.find((s) => s.status === 'synced');
  const activeProviderUrl = info?.remoteUrl || info?.activeStore?.endpointURL;
  const activeProviderId = KNOWN_PROVIDERS.find((p) => activeProviderUrl?.includes(p.url))?.id ?? 'yours';

  // ── Provider selection sub-page ──────────────────────────────────────────

  if (subPage === 'providers') {
    return (
      <div className="flex flex-col w-full py-2 pb-20 space-y-3">
        <p className="text-[10px] px-1" style={{ color: gray }}>
          Choose a storage provider or enter a custom URL. Providers can be added to the wallet repo via pull request.
        </p>

        {/* Known providers */}
        {KNOWN_PROVIDERS.map((provider) => {
          const isActive = provider.id === activeProviderId;
          return (
            <motion.button
              key={provider.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (!isActive) handleMigrate(provider.url);
              }}
              disabled={isActive || migrating}
              className="flex items-start w-full px-3 py-3 rounded-xl text-left border-0 outline-none cursor-pointer disabled:cursor-default"
              style={{
                background: isActive ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Server size={16} style={{ color: isActive ? '#34D399' : gray }} className="shrink-0 mt-0.5" />
              <div className="ml-2.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: contrast }}>
                    {provider.name}
                  </span>
                  {isActive && <Check size={12} style={{ color: '#34D399' }} />}
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: gray }}>
                  {provider.description}
                </p>
                <p className="text-[9px] mt-1 font-mono" style={{ color: gray }}>
                  {provider.url}
                </p>
              </div>
              <span className="text-[10px] shrink-0 ml-2" style={{ color: '#34D399' }}>
                {formatBytes(provider.freeTierBytes)} free
              </span>
            </motion.button>
          );
        })}

        {/* Custom URL */}
        <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: contrast }}>
            Custom Provider
          </h3>
          <p className="text-[9px] mb-2.5" style={{ color: gray }}>
            Enter any URL that implements the storage API
          </p>
          <Input
            theme={theme}
            placeholder="https://your-server.com/storage"
            type="text"
            onChange={(e) => setNewRemoteUrl(e.target.value)}
            value={newRemoteUrl}
          />
          <div className="mt-2">
            <Button
              theme={theme}
              type="secondary-outline"
              label={migrating ? 'Connecting...' : 'Connect'}
              onClick={migrating ? () => {} : () => handleMigrate(newRemoteUrl)}
              loading={migrating}
            />
          </div>
        </div>

        {/* Back */}
        <button
          onClick={() => setSubPage('main')}
          className="text-xs font-medium border-0 outline-none cursor-pointer bg-transparent py-2"
          style={{ color: gray }}
        >
          Back to storage overview
        </button>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center w-full py-2 pb-20 space-y-3">
      {/* ── Usage card ─────────────────────────────────────────────── */}
      <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
        {/* Provider + status row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server size={14} style={{ color: gray }} />
            <span className="text-xs font-medium" style={{ color: contrast }}>
              {remoteStatus.provider}
            </span>
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{
                color: currentTier?.pricePerMonthSats ? '#FDB022' : '#34D399',
                background: currentTier?.pricePerMonthSats ? 'rgba(253,176,34,0.1)' : 'rgba(52,211,153,0.1)',
              }}
            >
              {currentTier?.name ?? remoteStatus.tier}
            </span>
          </div>
          {lastSync && (
            <span className="text-[9px]" style={{ color: gray }}>
              Synced {lastSync.when ? new Date(lastSync.when).toLocaleDateString() : 'recently'}
            </span>
          )}
        </div>

        {/* Usage bar */}
        <div className="mb-2">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: contrast }}>
              {formatBytes(remoteStatus.usedBytes)}
            </span>
            <span className="text-[10px]" style={{ color: gray }}>
              {remoteStatus.totalBytes < 0 ? 'Unlimited' : `of ${formatBytes(remoteStatus.totalBytes)}`}
            </span>
          </div>
          {remoteStatus.totalBytes > 0 && (
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: barColor }}
              />
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex mt-3">
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
              {pct}%
            </p>
            <p className="text-[9px]" style={{ color: gray }}>
              Used
            </p>
          </div>
        </div>

        {/* Payment due warning */}
        <Show when={remoteStatus.paymentDue}>
          <div
            className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(249,112,102,0.08)', border: '1px solid rgba(249,112,102,0.2)' }}
          >
            <Zap size={12} style={{ color: '#F97066' }} />
            <span className="text-[10px] font-medium" style={{ color: '#F97066' }}>
              Payment due: {remoteStatus.paymentAmount?.toLocaleString()} sats
            </span>
          </div>
        </Show>

        {/* Sync button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={syncing ? undefined : handleSyncBackups}
          disabled={syncing}
          className="flex items-center justify-center gap-2 w-full mt-3 py-2 rounded-lg text-xs font-medium border-0 outline-none cursor-pointer disabled:opacity-50"
          style={{ color: gray, background: 'rgba(255,255,255,0.04)' }}
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </motion.button>
      </div>

      {/* ── Upgrade tiers ──────────────────────────────────────────── */}
      <Show when={upgradeTiers.length > 0}>
        <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: contrast }}>
            Upgrade Storage
          </h3>
          <div className="space-y-2">
            {upgradeTiers.map((tier) => (
              <motion.button
                key={tier.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleUpgrade(tier.id)}
                className="flex items-center w-full px-3 py-2.5 rounded-lg text-left border-0 outline-none cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Shield size={14} style={{ color: '#FDB022' }} className="shrink-0" />
                <div className="ml-2.5 flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold" style={{ color: contrast }}>
                      {tier.name}
                    </span>
                    <span className="text-[10px]" style={{ color: gray }}>
                      {tier.storageLimitBytes < 0 ? 'Unlimited' : formatBytes(tier.storageLimitBytes)}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: gray }}>
                    {tier.description}
                  </p>
                </div>
                <span className="text-[10px] font-semibold shrink-0 ml-2" style={{ color: '#FDB022' }}>
                  {tier.pricePerMonthSats.toLocaleString()} sats/mo
                </span>
              </motion.button>
            ))}
          </div>
          <p className="text-[9px] text-center mt-2" style={{ color: gray }}>
            Paid via BSV from your wallet on each sync
          </p>
        </div>
      </Show>

      {/* ── Change provider button ─────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setSubPage('providers')}
        className="flex items-center justify-between w-full px-4 py-3 rounded-xl border-0 outline-none cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <ExternalLink size={14} style={{ color: gray }} />
          <span className="text-xs font-medium" style={{ color: contrast }}>
            Change Provider
          </span>
        </div>
        <span className="text-[10px]" style={{ color: gray }}>
          {KNOWN_PROVIDERS.length} available
        </span>
      </motion.button>

      {/* ── Advanced ───────────────────────────────────────────────── */}
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
            className="w-full overflow-hidden space-y-3"
          >
            {/* Provider info */}
            <div className="w-full rounded-xl p-4 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
              <h3 className="text-xs font-semibold mb-2" style={{ color: contrast }}>
                Provider Details
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
                    Endpoint
                  </p>
                  <p className="text-[10px] break-all font-mono mt-0.5" style={{ color: contrast }}>
                    {activeProviderUrl || 'Default (Yours)'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
                    Storage Identity
                  </p>
                  <p className="text-[10px] break-all font-mono mt-0.5" style={{ color: contrast }}>
                    {info?.activeStore?.storageIdentityKey || info?.storageIdentityKey || '-'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
