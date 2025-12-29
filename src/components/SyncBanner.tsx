import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useSyncTracker } from '../hooks/useSyncTracker';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { WhiteLabelTheme } from '../theme.types';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { Show } from './Show';

const Banner = styled.div<WhiteLabelTheme & { $isSyncing: boolean }>`
  position: fixed;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  top: 0;
  width: 100%;
  min-height: 3.25rem;
  font-size: 0.9rem;
  font-weight: 700;
  background-color: ${({ theme, $isSyncing }) =>
    $isSyncing ? theme.color.component.queueBannerSyncing : theme.color.component.queueBannerSynced};
  color: ${({ theme, $isSyncing }) =>
    $isSyncing ? theme.color.component.queueBannerSyncingText : theme.color.component.queueBannerSyncedText};
  padding: 1rem 0.5rem;
  text-align: center;
  z-index: 1000;
  cursor: progress;
`;

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
        <Banner theme={theme} $isSyncing={isSyncing}>
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
        </Banner>
      )}
    </Show>
  );
};
