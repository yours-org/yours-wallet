import React, { createContext, useEffect } from 'react';
import { useNoApprovalLimitSetting } from '../hooks/useApprovalLimitSetting';
import { useBsv } from '../hooks/useBsv';
import { useGorillaPool } from '../hooks/useGorillaPool';
import { useKeys } from '../hooks/useKeys';
import { useNetwork } from '../hooks/useNetwork';
import { BSV20Data, OrdinalData, useOrds } from '../hooks/useOrds';
import { usePasswordSetting } from '../hooks/usePasswordSetting';
import { useWalletLockState } from '../hooks/useWalletLockState';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { Keys } from '../utils/keys';
import { NetWork } from '../utils/network';
import { storage } from '../utils/storage';

export interface Web3ContextProps {
  network: NetWork;
  ordinals: OrdinalData;
  bsv20s: BSV20Data;
  isPasswordRequired: boolean;
  noApprovalLimit: number | undefined;
  exchangeRate: number;
  updateNetwork: (n: NetWork) => void;
  updateNoApprovalLimit: (amt: number) => void;
  updatePasswordRequirement: (passwordSetting: boolean) => void;
}

export const Web3Context = createContext<Web3ContextProps | undefined>(undefined);

interface Web3ProviderProps {
  children: React.ReactNode;
}
export const Web3Provider = (props: Web3ProviderProps) => {
  const { children } = props;
  const { isLocked } = useWalletLockState();
  const { bsvAddress, bsvPubKey, bsvBalance, exchangeRate, updateBsvBalance, identityAddress, identityPubKey } =
    useBsv();
  const { ordAddress, ordPubKey, getOrdinals, ordinals, bsv20s } = useOrds();
  const { retrieveKeys } = useKeys();
  const { setDerivationTags } = useGorillaPool();
  const { network, setNetwork } = useNetwork();
  const { isPasswordRequired, setIsPasswordRequired } = usePasswordSetting();
  const { noApprovalLimit, setNoAprrovalLimit } = useNoApprovalLimitSetting();

  useEffect(() => {
    // Here we are pulling in any new Utxos unaccounted for.
    if (bsvAddress) {
      setTimeout(() => {
        updateBsvBalance(true);
      }, 1500);
    }

    if (ordAddress) {
      setTimeout(() => {
        getOrdinals();
      }, 1500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress, ordAddress]);

  useEffect(() => {
    if (isLocked) {
      storage.remove('appState');
      return;
    }

    (async () => {
      const keys = (await retrieveKeys(undefined, true)) as Keys;
      if (keys.identityAddress && keys.identityWif) {
        await setDerivationTags(keys.identityAddress, keys);
      }
    })();

    storage.get(['appState'], (result) => {
      const { appState } = result;

      // only update appState when popupWindowId is empty;

      const balance = {
        bsv: bsvBalance,
        satoshis: Math.round(bsvBalance * BSV_DECIMAL_CONVERSION),
        usdInCents: Math.round(bsvBalance * exchangeRate * 100),
      };

      storage.set({
        appState: {
          isLocked,
          ordinals: ordinals.initialized ? ordinals.data : appState?.ordinals || [],
          balance,
          network,
          isPasswordRequired,
          addresses: { bsvAddress, ordAddress, identityAddress },
          pubKeys: { bsvPubKey, ordPubKey, identityPubKey },
        },
      });
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
    identityAddress,
    identityPubKey,
    retrieveKeys,
    setDerivationTags,
  ]);

  const updateNetwork = (n: NetWork): void => {
    storage.set({
      network: n,
    });
    storage.set({ paymentUtxos: [] });
    setNetwork(n);
  };

  const updatePasswordRequirement = (isRequired: boolean): void => {
    storage.set({ isPasswordRequired: isRequired });
    setIsPasswordRequired(isRequired);
  };

  const updateNoApprovalLimit = (amt: number) => {
    storage.set({ noApprovalLimit: amt });
    setNoAprrovalLimit(amt);
  };

  return (
    <Web3Context.Provider
      value={{
        network,
        updateNetwork,
        ordinals,
        bsv20s,
        updatePasswordRequirement,
        isPasswordRequired,
        noApprovalLimit,
        updateNoApprovalLimit,
        exchangeRate,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};
