import { createContext, ReactNode } from 'react';
import { useBlockHeightTracker } from '../hooks/useBlockHeightTracker';

type QueueContextType = {
  percentCompleted: number;
  showSyncPage: boolean;
};

const BlockHeightContext = createContext<QueueContextType | null>(null);

export const BlockHeightProvider = ({ children }: { children: ReactNode }) => {
  const { percentCompleted, showSyncPage } = useBlockHeightTracker();

  return (
    <BlockHeightContext.Provider value={{ percentCompleted, showSyncPage }}>{children}</BlockHeightContext.Provider>
  );
};
