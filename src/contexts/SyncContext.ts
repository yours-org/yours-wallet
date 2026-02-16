import { createContext } from 'react';
import { Theme } from '../theme.types';

type SyncContextType = {
  pendingCount: number;
  showSyncBanner: boolean;
  updateBalance: boolean;
  theme: Theme;
  isSyncing: boolean;
};

export const SyncContext = createContext<SyncContextType | null>(null);
