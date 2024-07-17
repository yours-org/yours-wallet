import React, { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { WhatsOnChainService } from '../services/WhatsOnChain.service';
import { GorillaPoolService } from '../services/GorillaPool.service';
import { KeysService } from '../services/Keys.service';
import { ContractService } from '../services/Contract.service';
import { BsvService } from '../services/Bsv.service';
import { OrdinalService } from '../services/Ordinal.service';
import { INACTIVITY_LIMIT } from '../utils/constants';
import { TxoStore } from '../services/txo-store';
import { BlockHeaderService } from '../services/block-headers';
import { Indexer } from '../services/txo-store/models/indexer';
import { FundIndexer } from '../services/txo-store/mods/fund';
import { OrdIndexer } from '../services/txo-store/mods/ord';

const initializeServices = async () => {
  const chromeStorageService = new ChromeStorageService();
  await chromeStorageService.getAndSetStorage(); // Ensure the storage is initialized

  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();

  const indexers: Indexer[] = [
    new FundIndexer(new Set<string>([account?.addresses?.bsvAddress || ''])),
    new OrdIndexer(new Set<string>([account?.addresses?.ordAddress || ''])),
  ];
  const network = chromeStorageService.getNetwork();
  const blockHeaderService = new BlockHeaderService(network);
  const txoStore = new TxoStore(selectedAccount || '', indexers, undefined, blockHeaderService, network);

  const wocService = new WhatsOnChainService(chromeStorageService);
  const gorillaPoolService = new GorillaPoolService(chromeStorageService);
  const keysService = new KeysService(gorillaPoolService, wocService, chromeStorageService);
  const contractService = new ContractService(keysService, gorillaPoolService);
  const bsvService = new BsvService(
    keysService,
    gorillaPoolService,
    wocService,
    contractService,
    chromeStorageService,
    txoStore,
  );
  const ordinalService = new OrdinalService(
    keysService,
    wocService,
    gorillaPoolService,
    chromeStorageService,
    txoStore,
  );

  return {
    chromeStorageService,
    keysService,
    bsvService,
    ordinalService,
    wocService,
    gorillaPoolService,
    contractService,
    txoStore,
  };
};

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
  txoStore: TxoStore;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);

export const ServiceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<Partial<ServiceContextProps>>({});
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const initServices = async () => {
      try {
        const initializedServices = await initializeServices();
        const { chromeStorageService, keysService, bsvService, ordinalService } = initializedServices;
        const { account } = chromeStorageService.getCurrentAccountObject();

        if (account) {
          const { bsvAddress, ordAddress } = account.addresses;
          if (bsvAddress && ordAddress) {
            await keysService.retrieveKeys();
            await bsvService.rate();
            await bsvService.updateBsvBalance(true);
            // await ordinalService.getAndSetOrdinals(ordAddress);
          }
        }

        setServices({ ...initializedServices, isLocked, isReady, lockWallet });
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing services:', error);
        //TODO: show error to user?
      }
    };
    initServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockWallet = useCallback(async () => {
    if (!isReady) return;
    setIsLocked(true);
    const timestamp = Date.now();
    const twentyMinutesAgo = timestamp - 20 * 60 * 1000;
    services?.chromeStorageService?.update({ lastActiveTime: twentyMinutesAgo });
  }, [isReady, services]);

  useEffect(() => {
    const checkLockState = async () => {
      if (!isReady || !services) return;
      try {
        const result = services.chromeStorageService?.getCurrentAccountObject();
        const currentTime = Date.now();
        const lastActiveTime = result?.lastActiveTime;

        if (!lastActiveTime) return;

        if (!result?.account?.encryptedKeys) {
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
  }, [lockWallet, isReady, services]);

  return (
    <ServiceContext.Provider
      value={
        {
          ...services,
          isLocked,
          isReady,
          lockWallet,
        } as ServiceContextProps
      }
    >
      {children}
    </ServiceContext.Provider>
  );
};
