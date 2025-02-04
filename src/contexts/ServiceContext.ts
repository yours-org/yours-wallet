import { createContext } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { WhatsOnChainService } from '../services/WhatsOnChain.service';
import { KeysService } from '../services/Keys.service';
import { ContractService } from '../services/Contract.service';
import { BsvService } from '../services/Bsv.service';
import { OrdinalService } from '../services/Ordinal.service';
import { SPVStore } from 'spv-store';
import { GorillaPoolService } from '../services/GorillaPool.service';

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
  setIsLocked: (isLocked: boolean) => void;
  lockWallet: () => Promise<void>;
  oneSatSPV: SPVStore;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);
