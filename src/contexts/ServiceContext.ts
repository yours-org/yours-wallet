import { createContext } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { KeysService } from '../services/Keys.service';
import type { OneSatApi } from '@1sat/wallet-toolbox';
import { MneeInterface } from '@mnee/ts-sdk';

export interface ServiceContextProps {
  chromeStorageService: ChromeStorageService;
  keysService: KeysService;
  mneeService: MneeInterface;
  isLocked: boolean;
  isReady: boolean;
  setIsLocked: (isLocked: boolean) => void;
  lockWallet: () => Promise<void>;
  /** 1Sat API - uses ChromeCWI to communicate with service worker */
  oneSatApi: OneSatApi;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);
