import { createContext } from 'react';
import { SendMNEE } from '../services/types/provider.types';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import type {
  PermissionRequest,
  GroupedPermissionRequest,
  CounterpartyPermissionRequest,
} from '@bsv/wallet-toolbox-mobile';
import type { ApprovalContext } from '../yoursApi';
import type { OneSatPromptStorageEntry } from '../services/oneSatPrompt';

export type Web3RequestContextProps = {
  sendMNEERequest: SendMNEE[] | undefined;
  permissionRequest: (PermissionRequest & { requestID: string }) | undefined;
  groupedPermissionRequest: GroupedPermissionRequest | undefined;
  counterpartyPermissionRequest: CounterpartyPermissionRequest | undefined;
  transactionApprovalRequest: ApprovalContext | undefined;
  oneSatPermissionRequest: OneSatPromptStorageEntry | undefined;
  popupId: number | undefined;
  getStorageAndSetRequestState: (chromeStorageService: ChromeStorageService) => void;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);
