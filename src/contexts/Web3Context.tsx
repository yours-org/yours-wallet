import React, { createContext, useEffect } from 'react';
import { storage } from '../utils/storage';
import { useWalletLockState } from '../hooks/useWalletLockState';
import { useBsv } from '../hooks/useBsv';
import { useOrds } from '../hooks/useOrds';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { useNetwork } from '../hooks/useNetwork';
import { NetWork } from '../utils/network';
import { OrdinalResponse } from '../hooks/ordTypes';

export interface Web3ContextProps {
  network: NetWork;
  ordinals: OrdinalResponse;
  updateNetwork: (n: NetWork) => void;
}

export const Web3Context = createContext<Web3ContextProps | undefined>(undefined);

interface Web3ProviderProps {
  children: React.ReactNode;
}
export const Web3Provider = (props: Web3ProviderProps) => {
  const { children } = props;
  const { isLocked } = useWalletLockState();
  const { bsvAddress, bsvPubKey, bsvBalance, exchangeRate } = useBsv();
  const { ordAddress, ordinals, ordPubKey } = useOrds();
  const { network, setNetwork } = useNetwork();

  const updateNetwork = (n: NetWork): void => {
    storage.set({
      network: n,
    });
    setNetwork(n);
  };

  useEffect(() => {
    if (isLocked) {
      storage.remove('appState');
      return;
    }
    const balance = {
      bsv: bsvBalance,
      sat: Math.round(bsvBalance * BSV_DECIMAL_CONVERSION),
      usdInCents: Math.round(bsvBalance * exchangeRate * 100),
    };

    storage.set({
      appState: {
        isLocked,
        ordinals,
        balance,
        network,
        addresses: { bsvAddress, ordAddress },
        pubKeys: { bsvPubKey, ordPubKey },
      },
    });
  }, [isLocked, bsvAddress, ordAddress, ordinals, bsvPubKey, ordPubKey, bsvBalance, exchangeRate, network]);

  return <Web3Context.Provider value={{ network, updateNetwork, ordinals }}>{children}</Web3Context.Provider>;
};
