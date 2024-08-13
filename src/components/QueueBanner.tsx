import { useContext } from 'react';
import styled from 'styled-components';
import { QueueContext } from '../contexts/QueueContext';
import { ColorThemeProps } from '../theme';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { Show } from './Show';

const Banner = styled.div<ColorThemeProps & { $isSyncing: boolean }>`
  position: fixed;
  top: 0;
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  background-color: ${({ theme, $isSyncing }) => ($isSyncing ? theme.warning : theme.primaryButton)};
  color: #333;
  padding: 1rem 0.5rem;
  text-align: center;
  z-index: 1000;
`;

export const QueueBanner = () => {
  const queueContext = useContext(QueueContext);
  const isSyncing = queueContext?.queueLength !== 0;

  if (!queueContext?.showQueueBanner) return null;

  return (
    <Banner theme={queueContext.theme} $isSyncing={isSyncing}>
      <Show when={isSyncing} whenFalseContent={<>Your wallet is fully synced!</>}>
        Yours Wallet is syncing {formatNumberWithCommasAndDecimals(queueContext.queueLength, 0)} transactions...
      </Show>
    </Banner>
  );
};
