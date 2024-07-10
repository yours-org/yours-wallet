import { useContext } from 'react';
import { AppStateContext, AppStateContextProps } from '../contexts/AppStateContext';

export const useAppStateContext = (): AppStateContextProps => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppStateContext must be used within a AppStateProvider');
  }
  return context;
};
