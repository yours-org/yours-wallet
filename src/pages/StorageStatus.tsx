import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Show } from '../components/Show';
import { PageLoader } from '../components/PageLoader';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';

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

interface StorageInfo {
  activeStore: StoreInfo | null;
  backupStores: StoreInfo[];
  storageIdentityKey: string;
  remoteUrl?: string;
  outputCount: number;
  transactionCount: number;
  syncStates: SyncStateInfo[];
}

export interface StorageStatusProps {
  onBack: () => void;
}

export const StorageStatus = ({ onBack }: StorageStatusProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [newRemoteUrl, setNewRemoteUrl] = useState('');

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

  const fetchStorageInfo = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET_INFO' });
      if (response.success) {
        setInfo(response.data);
      } else {
        addSnackbar(response.error || 'Failed to get storage info', 'error');
      }
    } catch (error) {
      addSnackbar('Failed to get storage info: ' + (error instanceof Error ? error.message : String(error)), 'error');
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

  const handleMigrate = async () => {
    if (!newRemoteUrl.trim()) {
      addSnackbar('Enter a remote URL', 'error');
      return;
    }
    setMigrating(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_MIGRATE_REMOTE', url: newRemoteUrl.trim() });
      if (response.success) {
        addSnackbar('Migration complete', 'success');
        setNewRemoteUrl('');
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

  const statusColor = (status: string): string => {
    switch (status) {
      case 'synced':
        return theme.color.component.primaryButtonLeftGradient;
      case 'error':
        return theme.color.component.snackbarError;
      default:
        return gray;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center w-full py-2">
        <PageLoader theme={theme} message="Loading storage info..." />
      </div>
    );
  }

  // Suppress unused onBack — parent (Settings) provides SubPageHeader
  void onBack;

  return (
    <div className="flex flex-col items-center w-full py-2 px-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Database size={18} style={{ color: '#A1FF8B' }} />
        <h2 className="text-lg font-bold" style={{ color: contrast }}>
          Storage
        </h2>
      </div>

      <Show when={!!info}>
        {/* Active Storage */}
        <div className="w-full rounded-xl p-4 mb-3 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: contrast }}>
            Active Storage
          </h3>
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
              Location
            </p>
            <p className="text-xs break-all mt-0.5" style={{ color: contrast }}>
              {info?.remoteUrl || info?.activeStore?.endpointURL || 'Local'}
            </p>
          </div>
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
              Storage Identity Key
            </p>
            <p className="text-xs break-all mt-0.5 font-mono" style={{ color: contrast }}>
              {info?.activeStore?.storageIdentityKey || info?.storageIdentityKey || '-'}
            </p>
          </div>
          <div className="flex">
            <div className="flex-1 text-center">
              <p className="text-lg font-bold" style={{ color: contrast }}>
                {info?.outputCount?.toLocaleString() ?? '-'}
              </p>
              <p className="text-[10px]" style={{ color: gray }}>
                Outputs
              </p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-lg font-bold" style={{ color: contrast }}>
                {info?.transactionCount?.toLocaleString() ?? '-'}
              </p>
              <p className="text-[10px]" style={{ color: gray }}>
                Transactions
              </p>
            </div>
          </div>
        </div>

        {/* Backups */}
        <Show when={(info?.backupStores?.length ?? 0) > 0 || (info?.syncStates?.length ?? 0) > 0}>
          <div className="w-full rounded-xl p-4 mb-3 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: contrast }}>
              Backups
            </h3>
            {info?.syncStates?.map((state) => (
              <div key={state.storageIdentityKey} className="mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: contrast }}>
                    {state.storageName}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: statusColor(state.status) }}
                  >
                    {state.status}
                  </span>
                </div>
                <Show when={!!state.when}>
                  <p className="text-[10px] mt-0.5" style={{ color: gray }}>
                    Last synced: {state.when ? new Date(state.when).toLocaleString() : '-'}
                  </p>
                </Show>
              </div>
            ))}
            {info?.backupStores
              ?.filter((bs) => !info.syncStates?.some((ss) => ss.storageIdentityKey === bs.storageIdentityKey))
              .map((store) => (
                <div key={store.storageIdentityKey} className="mb-2">
                  <p className="text-xs" style={{ color: contrast }}>
                    {store.storageName}
                  </p>
                  <p className="text-[10px]" style={{ color: gray }}>
                    {store.endpointURL || 'Local'}
                  </p>
                </div>
              ))}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={syncing ? undefined : handleSyncBackups}
              disabled={syncing}
              className="flex items-center justify-center gap-2 w-full mt-2 py-2 rounded-xl text-xs font-semibold border-0 outline-none cursor-pointer disabled:opacity-50 bg-[#17191E] hover:bg-[#1f2128] transition-colors"
              style={{ color: contrast, border: `1px solid ${gray}20` }}
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </motion.button>
          </div>
        </Show>

        {/* Change Remote */}
        <div className="w-full rounded-xl p-4 mb-3 bg-[#17191E]" style={{ border: `1px solid ${gray}15` }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: contrast }}>
            Change Remote
          </h3>
          <p className="text-[10px] mb-3" style={{ color: gray }}>
            Migrate wallet data to a new remote storage server
          </p>
          <Input
            theme={theme}
            placeholder="https://example.com/wallet"
            type="text"
            onChange={(e) => setNewRemoteUrl(e.target.value)}
            value={newRemoteUrl}
          />
          <div className="mt-2">
            <Button
              theme={theme}
              type="primary"
              label={migrating ? 'Migrating...' : 'Migrate'}
              onClick={migrating ? () => {} : handleMigrate}
            />
          </div>
        </div>
      </Show>
    </div>
  );
};
