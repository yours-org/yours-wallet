import React, { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import init from 'bsv-wasm-web';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { WhatsOnChainService } from '../services/WhatsOnChain.service';
import { GorillaPoolService } from '../services/GorillaPool.service';
import { KeysService } from '../services/Keys.service';
import { ContractService } from '../services/Contract.service';
import { BsvService } from '../services/Bsv.service';
import { OrdinalService } from '../services/Ordinal.service';
import { INACTIVITY_LIMIT } from '../utils/constants';
init();

const chromeStorageService = new ChromeStorageService();
const wocService = new WhatsOnChainService(chromeStorageService);
const gorillaPoolService = new GorillaPoolService(chromeStorageService);
const keysService = new KeysService(gorillaPoolService, wocService, chromeStorageService);
const contractService = new ContractService(keysService, gorillaPoolService);
const bsvService = new BsvService(keysService, gorillaPoolService, wocService, contractService, chromeStorageService);
const ordinalService = new OrdinalService(keysService, wocService, gorillaPoolService);

export interface ServiceContextProps {
  chromeStorageService: ChromeStorageService;
  keysService: KeysService;
  bsvService: BsvService;
  ordinalService: OrdinalService;
  wocService: WhatsOnChainService;
  gorillaPoolService: GorillaPoolService;
  contractService: ContractService;
  isLocked: boolean;
  isReady: boolean;
  lockWallet: () => Promise<void>;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);

export const ServiceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  const lockWallet = useCallback(async () => {
    const timestamp = Date.now();
    const twentyMinutesAgo = timestamp - 20 * 60 * 1000;
    await chromeStorageService.update({ lastActiveTime: twentyMinutesAgo });
    setIsLocked(true);
  }, []);

  useEffect(() => {
    (async () => {
      await chromeStorageService.getStorage();
      if (chromeStorageService.storage) {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (account?.addresses?.bsvAddress) {
          await keysService.retrieveKeys();
          await bsvService.updateBsvBalance(true);
        }
        await bsvService.rate();
        setIsReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const checkLockState = async () => {
      try {
        const result = chromeStorageService.getCurrentAccountObject();
        const currentTime = Date.now();
        const lastActiveTime = result.lastActiveTime;

        if (!lastActiveTime) return;

        if (!result.account?.encryptedKeys) {
          setIsLocked(false);
          return;
        }

        if (currentTime - lastActiveTime > INACTIVITY_LIMIT) {
          lockWallet();
        } else {
          setIsLocked(false);
        }
      } catch (error) {
        console.error('Error checking lock state:', error);
      }
    };

    checkLockState();

    const interval = setInterval(checkLockState, 5000);

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ServiceContext.Provider
      value={{
        chromeStorageService,
        keysService,
        bsvService,
        ordinalService,
        wocService,
        gorillaPoolService,
        contractService,
        isLocked,
        isReady,
        lockWallet,
      }}
    >
      {children}
    </ServiceContext.Provider>
  );
};
