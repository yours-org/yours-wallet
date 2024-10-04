import { useEffect } from 'react';
import styled from 'styled-components';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { useSnackbar } from '../hooks/useSnackbar';
import { WhiteLabelTheme } from '../theme.types';
import { formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
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

export const QueueBanner = () => {
  const { isSyncing, showQueueBanner, theme, queueLength, importName, fetchingTxid } = useQueueTracker();
  const { addSnackbar } = useSnackbar();

  useEffect(() => {
    if (!isSyncing) {
      addSnackbar('SPV Wallet is now synced!', 'success', 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, showQueueBanner]);

  return (
    <Show when={showQueueBanner}>
      {theme && (
        <Banner theme={theme} $isSyncing={isSyncing}>
          <Show when={isSyncing}>
            {importName
              ? `Importing ${importName}...`
              : `SPV Wallet is syncing ${formatNumberWithCommasAndDecimals(queueLength, 0)} transactions...`}
            <br />
            <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>
              (You may safely close the wallet during this process)
            </span>
            <Show when={!!fetchingTxid}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.5rem' }}>
                {fetchingTxid ? truncate(fetchingTxid, 6, 6) : ''}
              </span>
            </Show>
          </Show>
        </Banner>
      )}
    </Show>
  );
};
