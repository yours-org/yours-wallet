import { useContext } from 'react';
import { ServiceContext, ServiceContextProps } from '../contexts/ServiceContext';

export const useServiceContext = (): ServiceContextProps => {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useAppStateContext must be used within a AppStateProvider');
  }
  return context;
};
