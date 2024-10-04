import { useContext } from 'react';
import { Web3RequestContext, Web3RequestContextProps } from '../contexts/Web3RequestContext';

export const useWeb3RequestContext = (): Web3RequestContextProps => {
  const context = useContext(Web3RequestContext);
  if (context === undefined) {
    throw new Error('useWeb3RequestContext must be used within a Web3RequestProvider');
  }
  return context;
};
