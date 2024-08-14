import { createContext, ReactNode } from 'react';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { Theme } from '../theme';

type QueueContextType = {
  queueLength: number;
  showQueueBanner: boolean;
  updateBalance: boolean;
  theme: Theme;
  isSyncing: boolean;
};

export const QueueContext = createContext<QueueContextType | null>(null);

export const QueueProvider = ({ children }: { children: ReactNode }) => {
  const { queueLength, showQueueBanner, theme, updateBalance, isSyncing } = useQueueTracker();

  return (
    <QueueContext.Provider value={{ queueLength, showQueueBanner, theme, updateBalance, isSyncing }}>
      {children}
    </QueueContext.Provider>
  );
};
