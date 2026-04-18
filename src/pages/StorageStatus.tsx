import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, HardDrive, RefreshCw, Server, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageLoader } from '../components/PageLoader';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';

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

export interface StorageStatusProps {
  onBack: () => void;
}

export const StorageStatus = ({ onBack: _onBack }: StorageStatusProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newRemoteUrl, setNewRemoteUrl] = useState('');

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

  const fetchInfo = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET_INFO' });
      if (response?.success) setInfo(response.data);
    } catch {
      // Wallet may not be ready yet; UI renders empty state.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const runAction = async (
    action: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
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
      addSnackbar(
        error instanceof Error ? error.message : 'Action failed',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSync = () =>
    runAction('STORAGE_SYNC_BACKUPS', {}, 'Backups synced');

  const handleSetActive = (target: 'local' | string) =>
    runAction(
      'STORAGE_SET_ACTIVE_STORAGE',
      { target },
      target === 'local' ? 'Active storage set to local' : `Active set to ${target}`,
    );

  const handleAddRemote = async () => {
    const url = newRemoteUrl.trim();
    if (!url) {
      addSnackbar('Enter a remote URL', 'error');
      return;
    }
    try {
      new URL(url);
    } catch {
      addSnackbar('Invalid URL', 'error');
      return;
    }
    await runAction('STORAGE_ADD_REMOTE', { url }, 'Remote added');
    setNewRemoteUrl('');
  };

  const handleRemoveRemote = (url: string) =>
    runAction('STORAGE_REMOVE_REMOTE', { url }, 'Remote removed');

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
  const lastSync = info?.syncStates?.find((s) => s.status === 'synced');

  return (
    <div className="flex flex-col items-center w-full py-2 pb-20 space-y-3">
      {/* Active storage */}
      <div
        className="w-full rounded-xl p-4 bg-[#17191E]"
        style={{ border: `1px solid ${gray}15` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: gray }}>
            Active Storage
          </span>
          {lastSync && (
            <span className="text-[9px]" style={{ color: gray }}>
              Synced {lastSync.when ? new Date(lastSync.when).toLocaleDateString() : 'recently'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          {localIsActive ? (
            <HardDrive size={16} style={{ color: '#34D399' }} />
          ) : (
            <Server size={16} style={{ color: '#34D399' }} />
          )}
          <span className="text-sm font-semibold" style={{ color: contrast }}>
            {localIsActive ? 'Local' : activeRemote}
          </span>
        </div>

        <div className="flex mt-3">
          <div className="flex-1 text-center">
            <p className="text-base font-bold" style={{ color: contrast }}>
              {info?.outputCount?.toLocaleString() ?? '0'}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>Outputs</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-base font-bold" style={{ color: contrast }}>
              {info?.transactionCount?.toLocaleString() ?? '0'}
            </p>
            <p className="text-[9px]" style={{ color: gray }}>Transactions</p>
          </div>
        </div>

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

      {/* Stores list */}
      <div
        className="w-full rounded-xl p-4 bg-[#17191E]"
        style={{ border: `1px solid ${gray}15` }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-2"
          style={{ color: gray }}
        >
          Stores
        </p>

        {/* Local row */}
        <StoreRow
          icon={<HardDrive size={14} style={{ color: localIsActive ? '#34D399' : gray }} />}
          label="Local"
          sublabel="Browser IndexedDB"
          isActive={localIsActive}
          canRemove={false}
          disabled={busy}
          onSetActive={() => handleSetActive('local')}
          onRemove={() => {}}
          contrast={contrast}
          gray={gray}
        />

        {/* Remote rows */}
        {remotes.map((url) => {
          const isActive = activeRemote === url;
          return (
            <StoreRow
              key={url}
              icon={<Server size={14} style={{ color: isActive ? '#34D399' : gray }} />}
              label={url}
              sublabel="Remote"
              isActive={isActive}
              canRemove={!isActive}
              disabled={busy}
              onSetActive={() => handleSetActive(url)}
              onRemove={() => handleRemoveRemote(url)}
              contrast={contrast}
              gray={gray}
            />
          );
        })}

        {remotes.length === 0 && (
          <p className="text-[10px] mt-2" style={{ color: gray }}>
            No remotes configured. Add one below to enable off-device backup.
          </p>
        )}
      </div>

      {/* Add remote */}
      <div
        className="w-full rounded-xl p-4 bg-[#17191E]"
        style={{ border: `1px solid ${gray}15` }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-2"
          style={{ color: gray }}
        >
          Add Remote
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
            label={busy ? 'Working…' : 'Add'}
            onClick={busy ? () => {} : handleAddRemote}
            loading={busy}
          />
        </div>
      </div>

      {/* Identity */}
      <div
        className="w-full rounded-xl p-4 bg-[#17191E]"
        style={{ border: `1px solid ${gray}15` }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: gray }}
        >
          Storage Identity Key
        </p>
        <p className="text-[10px] break-all font-mono" style={{ color: contrast }}>
          {info?.storageIdentityKey ?? '—'}
        </p>
      </div>
    </div>
  );
};

interface StoreRowProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  isActive: boolean;
  canRemove: boolean;
  disabled: boolean;
  onSetActive: () => void;
  onRemove: () => void;
  contrast: string;
  gray: string;
}

const StoreRow = ({
  icon,
  label,
  sublabel,
  isActive,
  canRemove,
  disabled,
  onSetActive,
  onRemove,
  contrast,
  gray,
}: StoreRowProps) => (
  <div
    className="flex items-center w-full px-3 py-2.5 rounded-lg my-1.5"
    style={{
      background: isActive ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
      border: isActive ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <div className="shrink-0">{icon}</div>
    <div className="ml-2.5 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold truncate"
          style={{ color: contrast }}
          title={label}
        >
          {label}
        </span>
        {isActive && <Check size={12} style={{ color: '#34D399' }} className="shrink-0" />}
      </div>
      <p className="text-[9px]" style={{ color: gray }}>
        {sublabel}
      </p>
    </div>
    <div className="flex items-center gap-1 shrink-0 ml-2">
      {!isActive && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={disabled ? undefined : onSetActive}
          disabled={disabled}
          className="text-[10px] font-medium px-2 py-1 rounded border-0 outline-none cursor-pointer disabled:opacity-50"
          style={{
            color: contrast,
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          Set Active
        </motion.button>
      )}
      {canRemove && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={disabled ? undefined : onRemove}
          disabled={disabled}
          className="flex items-center justify-center p-1 rounded border-0 outline-none cursor-pointer disabled:opacity-50"
          style={{
            color: '#F97066',
            background: 'rgba(249,112,102,0.08)',
          }}
          aria-label="Remove remote"
          title="Remove remote"
        >
          <Trash2 size={12} />
        </motion.button>
      )}
    </div>
  </div>
);
