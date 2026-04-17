import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChromeStorageService } from '../../services/ChromeStorage.service';
import { KeysService } from '../../services/Keys.service';
import { INACTIVITY_LIMIT } from '../../utils/constants';
import { ServiceContext, ServiceContextProps } from '../ServiceContext';
import { createContext, syncAddresses } from '@1sat/actions';
import { fetchExchangeRate } from '../../utils/wallet';
import { createChromeCWI, OneSatServices, YOURS_PREFIX } from '@1sat/wallet-browser';
import { NetWork } from 'yours-wallet-provider';

const initializeServices = async () => {
  const chromeStorageService = new ChromeStorageService();
  await chromeStorageService.getAndSetStorage();

  const keysService = new KeysService(chromeStorageService);

  // Create context using ChromeCWI (communicates with service worker via chrome.runtime.sendMessage)
  const chromeCWI = createChromeCWI();
  const network = chromeStorageService.getNetwork();
  const chain = network === NetWork.Mainnet ? 'main' : 'test';
  const services = new OneSatServices(chain);
  const apiContext = createContext(chromeCWI, { chain, services });

  return {
    chromeStorageService,
    keysService,
    apiContext,
  };
};

export const ServiceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<Partial<ServiceContextProps>>({});
  const [isLocked, setIsLocked] = useState<boolean>(true); // Start locked until checkLockState runs
  const [isReady, setIsReady] = useState<boolean>(false);
  const prevIsLockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (services?.chromeStorageService) {
      const timestamp = Date.now();
      const twentyMinutesAgo = timestamp - 20 * 60 * 1000;
      services.chromeStorageService.update({ lastActiveTime: isLocked ? twentyMinutesAgo : timestamp, isLocked });
      // Notify background to destroy decrypted keys only on actual lock transitions,
      // not on initial render (where isLocked starts as true before checkLockState runs)
      if (isLocked && prevIsLockedRef.current === false) {
        chrome.runtime.sendMessage({ action: 'WALLET_LOCKED' }).catch(() => {});
      }
      prevIsLockedRef.current = isLocked;
    }
  }, [isLocked, services?.chromeStorageService]);

  useEffect(() => {
    const initServices = async () => {
      try {
        const initializedServices = await initializeServices();
        const { chromeStorageService, apiContext } = initializedServices;
        const { account, lastActiveTime } = chromeStorageService.getCurrentAccountObject();

        // Determine initial lock state before marking ready
        // If no encrypted keys exist, user needs onboarding - not the unlock screen
        if (!account?.encryptedKeys) {
          setIsLocked(false);
        } else if (lastActiveTime && Date.now() - lastActiveTime <= chromeStorageService.getLockTimeout()) {
          // Has keys but was recently active - unlock
          setIsLocked(false);
        }
        // Otherwise keep isLocked=true (has keys, inactive)

        if (account) {
          // Pre-fetch exchange rate to cache it
          await fetchExchangeRate(apiContext.chain, apiContext.wocApiKey);
        }

        setServices({ ...initializedServices, isLocked, isReady, lockWallet });
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing services:', error);
      }
    };
    initServices();
    return () => {
      // Legacy cleanup — `walletImporting` was used by the old SyncBanner to show
      // an "Initializing..." state. Banner is gone, but clearing stale values in
      // long-time-user browsers is harmless.
      localStorage.removeItem('walletImporting');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run syncAddresses when wallet is unlocked
  useEffect(() => {
    if (!isReady || isLocked || !services?.apiContext) {
      return;
    }

    let cancelled = false;

    const runSync = async () => {
      try {
        const result = await syncAddresses.execute(services.apiContext!, {
          prefix: YOURS_PREFIX,
          count: 5,
        });
        if (!cancelled) {
          console.log('[ServiceProvider] Address sync complete:', result);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[ServiceProvider] Address sync error:', error);
        }
      }
    };

    runSync();

    return () => {
      cancelled = true;
    };
  }, [isReady, isLocked, services?.apiContext]);

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

        if (currentTime - lastActiveTime > (services?.chromeStorageService?.getLockTimeout() ?? INACTIVITY_LIMIT)) {
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
