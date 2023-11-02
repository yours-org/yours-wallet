import React, { createContext, useEffect } from 'react';
import { storage } from '../utils/storage';
import { useWalletLockState } from '../hooks/useWalletLockState';
import { useBsv } from '../hooks/useBsv';
import { useOrds } from '../hooks/useOrds';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { useNetwork } from '../hooks/useNetwork';
import { NetWork } from '../utils/network';
import { OrdinalResponse } from '../hooks/ordTypes';
import { usePasswordSetting } from '../hooks/usePasswordSetting';

export interface Web3ContextProps {
  network: NetWork;
  ordinals: OrdinalResponse;
  isPasswordRequired: boolean;
  updateNetwork: (n: NetWork) => void;
  updatePasswordRequirement: (passwordSetting: boolean) => void;
}

export const Web3Context = createContext<Web3ContextProps | undefined>(undefined);

interface Web3ProviderProps {
  children: React.ReactNode;
}
export const Web3Provider = (props: Web3ProviderProps) => {
  const { children } = props;
  const { isLocked } = useWalletLockState();
  const { bsvAddress, bsvPubKey, bsvBalance, exchangeRate, updateBsvBalance } = useBsv();
  const { ordAddress, ordinals, ordPubKey } = useOrds();
  const { network, setNetwork } = useNetwork();
  const { isPasswordRequired, setIsPasswordRequired } = usePasswordSetting();

  useEffect(() => {
    // Here we are pulling in any new Utxos unaccounted for.
    if (!bsvAddress) return;
    setTimeout(() => {
      updateBsvBalance(true);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  useEffect(() => {
    // Here we are pulling in any new Utxos unaccounted for.
    if (!bsvAddress) return;
    setTimeout(() => {
      updateBsvBalance(true);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  const updateNetwork = (n: NetWork): void => {
    storage.set({
      network: n,
    });
    setNetwork(n);
  };

  const updatePasswordRequirement = (isRequired: boolean): void => {
    storage.set({ isPasswordRequired: isRequired });
    setIsPasswordRequired(isRequired);
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
        isPasswordRequired,
        addresses: { bsvAddress, ordAddress },
        pubKeys: { bsvPubKey, ordPubKey },
      },
    });
  }, [
    isLocked,
    bsvAddress,
    ordAddress,
    ordinals,
    bsvPubKey,
    ordPubKey,
    bsvBalance,
    exchangeRate,
    network,
    isPasswordRequired,
  ]);

  return (
    <Web3Context.Provider value={{ network, updateNetwork, ordinals, updatePasswordRequirement, isPasswordRequired }}>
      {children}
    </Web3Context.Provider>
  );
};
