import { createContext } from 'react';

type QueueContextType = {
  percentCompleted: number;
  showSyncPage: boolean;
};

export const BlockHeightContext = createContext<QueueContextType | null>(null);
