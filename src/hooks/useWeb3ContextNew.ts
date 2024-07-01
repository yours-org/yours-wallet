import { useContext } from 'react';
import { Web3ContextNew, Web3ContextTypeNew } from '../contexts/Web3ContextNew';

export const useWeb3ContextNew = (): Web3ContextTypeNew => {
  const context = useContext(Web3ContextNew);
  if (context === undefined) {
    throw new Error('useWeb3Context must be used within a Web3Provider');
  }
  return context;
};
