import { useEffect, useState } from 'react';
import { useSyncTracker } from '../hooks/useSyncTracker';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { Show } from './Show';

export const SyncBanner = () => {
  const { keysService } = useServiceContext();
  const { isSyncing, showSyncBanner, theme, pendingCount, syncMessage } = useSyncTracker();
  const { addSnackbar } = useSnackbar();
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      const localVar = localStorage.getItem('walletImporting');
      setIsInitializing(localVar === 'true');
    }, 1000);
  }, []);

  useEffect(() => {
    if (pendingCount || syncMessage) {
      localStorage.removeItem('walletImporting');
      setIsInitializing(false);
    }
  }, [syncMessage, pendingCount]);

  useEffect(() => {
    if (!isSyncing && !isInitializing) {
      addSnackbar('SPV Wallet is now synced!', 'success', 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing]);

  return (
    <Show when={!!keysService?.bsvAddress && (isInitializing || showSyncBanner)}>
      {theme && (
        <div
          className="fixed flex flex-col justify-center items-center top-0 w-full min-h-[3.25rem] text-[0.9rem] font-bold px-2 py-4 text-center z-[1000] cursor-progress"
          style={{
            backgroundColor: isSyncing
              ? theme.color.component.queueBannerSyncing
              : theme.color.component.queueBannerSynced,
            color: isSyncing
              ? theme.color.component.queueBannerSyncingText
              : theme.color.component.queueBannerSyncedText,
          }}
        >
          <Show when={isSyncing}>
            {isInitializing
              ? 'Sync Process Initializing...'
              : syncMessage
                ? `${syncMessage}...`
                : `SPV Wallet is syncing${pendingCount ? ` ${formatNumberWithCommasAndDecimals(pendingCount, 0)} transactions` : ''}...`}
            <br />
            <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>
              {isInitializing
                ? 'Please be patient, this may take a minute or so.'
                : 'You may safely close the wallet during this process.'}
            </span>
          </Show>
        </div>
      )}
    </Show>
  );
};
