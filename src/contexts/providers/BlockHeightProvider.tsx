import { ReactNode } from 'react';
import { useBlockHeightTracker } from '../../hooks/useBlockHeightTracker';
import { BlockHeightContext } from '../BlockHeightContext';

export const BlockHeightProvider = ({ children }: { children: ReactNode }) => {
  const { percentCompleted, showSyncPage } = useBlockHeightTracker();

  return (
    <BlockHeightContext.Provider value={{ percentCompleted, showSyncPage }}>{children}</BlockHeightContext.Provider>
  );
};
