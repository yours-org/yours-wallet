import { createContext, ReactNode } from 'react';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { Theme } from '../theme';

type QueueContextType = {
  queueLength: number;
  showQueueBanner: boolean;
  theme: Theme;
};

export const QueueContext = createContext<QueueContextType | null>(null);

export const QueueProvider = ({ children }: { children: ReactNode }) => {
  const { queueLength, showQueueBanner, theme } = useQueueTracker();

  return <QueueContext.Provider value={{ queueLength, showQueueBanner, theme }}>{children}</QueueContext.Provider>;
};
