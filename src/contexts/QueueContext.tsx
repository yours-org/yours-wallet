import { createContext, ReactNode } from 'react';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { Theme } from '../theme';

type QueueContextType = {
  queueLength: number;
  showQueueBanner: boolean;
  updateBalance: boolean;
  theme: Theme;
};

export const QueueContext = createContext<QueueContextType | null>(null);

export const QueueProvider = ({ children }: { children: ReactNode; onUpdateBalance?: () => void }) => {
  const { queueLength, showQueueBanner, theme, updateBalance } = useQueueTracker();

  return (
    <QueueContext.Provider value={{ queueLength, showQueueBanner, theme, updateBalance }}>
      {children}
    </QueueContext.Provider>
  );
};
