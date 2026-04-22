import { createContext } from 'react';
import { SendMNEE } from '../services/types/provider.types';
import { RequestParams } from '../inject';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import type {
  PermissionRequest,
  GroupedPermissionRequest,
  CounterpartyPermissionRequest,
} from '@bsv/wallet-toolbox-mobile';
import type { ApprovalContext } from '../yoursApi';

export type Web3RequestContextProps = {
  connectRequest: RequestParams | undefined;
  sendMNEERequest: SendMNEE[] | undefined;
  permissionRequest: (PermissionRequest & { requestID: string }) | undefined;
  groupedPermissionRequest: GroupedPermissionRequest | undefined;
  counterpartyPermissionRequest: CounterpartyPermissionRequest | undefined;
  transactionApprovalRequest: ApprovalContext | undefined;
  popupId: number | undefined;
  getStorageAndSetRequestState: (chromeStorageService: ChromeStorageService) => void;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);
