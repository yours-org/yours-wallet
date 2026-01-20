import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChromeStorageService } from '../../services/ChromeStorage.service';
import { KeysService } from '../../services/Keys.service';
import { INACTIVITY_LIMIT, MNEE_API_TOKEN } from '../../utils/constants';
import { ServiceContext, ServiceContextProps } from '../ServiceContext';
import mnee from '@mnee/ts-sdk';
import { createChromeCWI, createContext, getExchangeRate, getChainInfo, SyncFetcher } from '@1sat/wallet-toolbox';
import { initSyncContext } from '../../initSyncContext';
import { NetWork } from 'yours-wallet-provider';

const initializeServices = async () => {
  const chromeStorageService = new ChromeStorageService();
  await chromeStorageService.getAndSetStorage();

  const keysService = new KeysService(chromeStorageService);

  const mneeService = new mnee({ environment: 'production', apiKey: MNEE_API_TOKEN });

  // Create context using ChromeCWI (communicates with service worker via chrome.runtime.sendMessage)
  const chromeCWI = createChromeCWI();
  const network = chromeStorageService.getNetwork();
  const chain = network === NetWork.Mainnet ? 'main' : 'test';
  const apiContext = createContext(chromeCWI, { chain });

  return {
    chromeStorageService,
    keysService,
    mneeService,
    apiContext,
  };
};

export const ServiceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<Partial<ServiceContextProps>>({});
  const [isLocked, setIsLocked] = useState<boolean>(true); // Start locked until checkLockState runs
  const [isReady, setIsReady] = useState<boolean>(false);
  const syncFetcherRef = useRef<SyncFetcher | null>(null);

  useEffect(() => {
    if (services?.chromeStorageService) {
      const timestamp = Date.now();
      const twentyMinutesAgo = timestamp - 20 * 60 * 1000;
      services.chromeStorageService.update({ lastActiveTime: isLocked ? twentyMinutesAgo : timestamp, isLocked });
    }
  }, [isLocked, services?.chromeStorageService]);

  useEffect(() => {
    const initServices = async () => {
      try {
        const initializedServices = await initializeServices();
        const { chromeStorageService, apiContext } = initializedServices;
        const { account } = chromeStorageService.getCurrentAccountObject();

        if (account) {
          // Pre-fetch exchange rate to cache it
          await getExchangeRate.execute(apiContext, {});
        }

        setServices({ ...initializedServices, isLocked, isReady, lockWallet });
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing services:', error);
      }
    };
    initServices();
    return () => {
      localStorage.removeItem('walletImporting'); // See SyncBanner.tsx
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start SyncFetcher when wallet is unlocked (isLocked changes to false)
  useEffect(() => {
    if (!isReady || isLocked || !services?.chromeStorageService || !services?.apiContext) {
      return;
    }

    const startSync = async () => {
      try {
        const { selectedAccount } = services.chromeStorageService!.getCurrentAccountObject();
        const network = services.chromeStorageService!.getNetwork();
        const chain = network === NetWork.Mainnet ? 'main' : 'test';
        // TODO: Load maxKeyIndex from chrome.storage, for now use 5 addresses
        const maxKeyIndex = 4; // 0-4 = 5 addresses

        const chromeCWI = createChromeCWI();
        const syncContext = await initSyncContext({
          wallet: chromeCWI,
          chain,
          accountId: selectedAccount || '',
          maxKeyIndex,
        });

        // Create and start SyncFetcher
        const fetcher = new SyncFetcher({
          services: syncContext.services,
          syncQueue: syncContext.syncQueue,
          addressManager: syncContext.addressManager,
        });
        syncFetcherRef.current = fetcher;

        // Get current block height and start fetching
        const chainInfo = await getChainInfo.execute(services.apiContext!, {});
        const height = chainInfo?.blocks ?? 0;
        fetcher.fetch(height).catch((err) => {
          console.error('SyncFetcher error:', err);
        });
      } catch (error) {
        console.error('Error starting sync:', error);
      }
    };

    startSync();

    return () => {
      // Stop fetcher when wallet is locked or component unmounts
      syncFetcherRef.current?.stop();
      syncFetcherRef.current = null;
    };
  }, [isReady, isLocked, services?.chromeStorageService, services?.apiContext]);

  const lockWallet = useCallback(async () => {
    if (!isReady) return;
    setIsLocked(true);
  }, [isReady]);

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
          setIsLocked,
          isReady,
          lockWallet,
        } as ServiceContextProps
      }
    >
      {children}
    </ServiceContext.Provider>
  );
};
