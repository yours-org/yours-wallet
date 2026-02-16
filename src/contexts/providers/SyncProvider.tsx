import { ReactNode } from 'react';
import { useSyncTracker } from '../../hooks/useSyncTracker';
import { SyncContext } from '../SyncContext';

export const SyncProvider = ({ children }: { children: ReactNode }) => {
  const { pendingCount, showSyncBanner, theme, updateBalance, isSyncing } = useSyncTracker();

  return (
    <SyncContext.Provider value={{ pendingCount, showSyncBanner, theme, updateBalance, isSyncing }}>
      {children}
    </SyncContext.Provider>
  );
};
