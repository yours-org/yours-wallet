import { useContext } from 'react';
import { ServiceContext, ServiceContextProps } from '../contexts/ServiceContext';

export const useServiceContext = (): ServiceContextProps => {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServiceContext must be used within a ServiceProvider');
  }
  return context;
};
