import { createContext } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { KeysService } from '../services/Keys.service';
import type { OneSatContext } from '@1sat/actions';

export interface ServiceContextProps {
  chromeStorageService: ChromeStorageService;
  keysService: KeysService;
  isLocked: boolean;
  isReady: boolean;
  setIsLocked: (isLocked: boolean) => void;
  lockWallet: () => Promise<void>;
  /** API context for calling 1Sat actions - uses ChromeCWI to communicate with service worker */
  apiContext: OneSatContext;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);
