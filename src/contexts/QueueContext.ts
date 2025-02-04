import { createContext } from 'react';
import { Theme } from '../theme.types';

type QueueContextType = {
  queueLength: number;
  showQueueBanner: boolean;
  updateBalance: boolean;
  theme: Theme;
  isSyncing: boolean;
};

export const QueueContext = createContext<QueueContextType | null>(null);
