import styled from 'styled-components';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { WhiteLabelTheme } from '../theme.types';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { Show } from './Show';

const Banner = styled.div<WhiteLabelTheme & { $isSyncing: boolean }>`
  position: fixed;
  top: 0;
  width: 100%;
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
  const { isSyncing, showQueueBanner, theme, queueLength } = useQueueTracker();

  return (
    <Show when={showQueueBanner}>
      {theme && (
        <Banner theme={theme} $isSyncing={isSyncing}>
          <Show when={isSyncing} whenFalseContent={<>Your wallet is fully synced!</>}>
            SPV Wallet is syncing {formatNumberWithCommasAndDecimals(queueLength, 0)} transactions...
            <br />
            <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>
              (You may safely close the wallet during this process)
            </span>
          </Show>
        </Banner>
      )}
    </Show>
  );
};
