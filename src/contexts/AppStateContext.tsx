import React, { createContext, ReactNode, SetStateAction, useEffect, useState } from 'react';
import { useNoApprovalLimitSetting } from '../hooks/useApprovalLimitSetting';
import { useBsv } from '../hooks/useBsv';
import { useGorillaPool } from '../hooks/useGorillaPool';
import { useKeys } from '../hooks/useKeys';
import { useNetwork } from '../hooks/useNetwork';
import { BSV20Data, OrdinalData, useOrds } from '../hooks/useOrds';
import { usePasswordSetting } from '../hooks/usePasswordSetting';
import { useWalletLockState } from '../hooks/useWalletLockState';
import { WhitelistedApp } from '../inject';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { Keys } from '../utils/keys';
import { NetWork } from '../utils/network';
import { storage } from '../utils/storage';
import { ChromeStorageObject, Dispatch } from './types/global.types';

export interface AppStateContextProps {
  network: NetWork;
  ordinals: OrdinalData;
  bsv20s: BSV20Data;
  isPasswordRequired: boolean;
  noApprovalLimit: number | undefined;
  exchangeRate: number;
  encryptedKeys: string | undefined;
  setEncryptedKeys: Dispatch<SetStateAction<string | undefined>>;
  whitelistedApps: WhitelistedApp[];
  updateNetwork: (n: NetWork) => void;
  updateNoApprovalLimit: (amt: number) => void;
  updatePasswordRequirement: (passwordSetting: boolean) => void;
}

export const AppStateContext = createContext<AppStateContextProps | undefined>(undefined);

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isLocked } = useWalletLockState();
  const { bsvAddress, bsvPubKey, bsvBalance, exchangeRate, updateBsvBalance, identityAddress, identityPubKey } =
    useBsv();
  const { ordAddress, ordPubKey, getOrdinals, ordinals, bsv20s } = useOrds();
  const { retrieveKeys } = useKeys();
  const { setDerivationTags } = useGorillaPool();
  const { network, setNetwork } = useNetwork();
  const { isPasswordRequired, setIsPasswordRequired } = usePasswordSetting();
  const { noApprovalLimit, setNoApprovalLimit } = useNoApprovalLimitSetting();
  const [encryptedKeys, setEncryptedKeys] = useState<string | undefined>(undefined);
  const [whitelistedApps, setWhitelistedApps] = useState<WhitelistedApp[]>([]);

  useEffect(() => {
    const handleStateChanges = async (result: Partial<ChromeStorageObject>) => {
      const { encryptedKeys, whitelist } = result;

      if (encryptedKeys) setEncryptedKeys(encryptedKeys);
      if (whitelist) setWhitelistedApps(whitelist);
    };

    const getStorageAndSetRequestState = async () => {
      const res: ChromeStorageObject = await storage.get(null); // passing null returns everything in storage
      handleStateChanges(res);

      // Ensures that any storage changes (other than requests) update the react app state
      storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
          const result: Partial<ChromeStorageObject> = {};
          Object.keys(changes).forEach((key) => {
            result[key] = changes[key].newValue;
          });
          handleStateChanges(result);
        }
      });
    };

    getStorageAndSetRequestState();
  }, []);

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

    storage.get(null).then(async (result: ChromeStorageObject) => {
      const { appState, popupWindowId } = result;

      const balance = {
        bsv: bsvBalance,
        satoshis: Math.round(bsvBalance * BSV_DECIMAL_CONVERSION),
        usdInCents: Math.round(bsvBalance * exchangeRate * 100),
      };
      if (popupWindowId) return; // Don't change app state if the popup window is open

      await storage.set({
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
    setNoApprovalLimit(amt);
  };

  return (
    <AppStateContext.Provider
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
        encryptedKeys,
        whitelistedApps,
        setEncryptedKeys,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};
