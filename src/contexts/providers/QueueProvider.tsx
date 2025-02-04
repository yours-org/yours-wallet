import { ReactNode } from 'react';
import { useQueueTracker } from '../../hooks/useQueueTracker';
import { QueueContext } from '../QueueContext';

export const QueueProvider = ({ children }: { children: ReactNode }) => {
  const { queueLength, showQueueBanner, theme, updateBalance, isSyncing } = useQueueTracker();

  return (
    <QueueContext.Provider value={{ queueLength, showQueueBanner, theme, updateBalance, isSyncing }}>
      {children}
    </QueueContext.Provider>
  );
};
