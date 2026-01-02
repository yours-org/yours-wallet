import { createContext } from 'react';
import {
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  PurchaseOrdinal,
  SendBsv,
  SendBsv20,
  SendMNEE,
  SignMessage,
  TaggedDerivationRequest,
  TransferOrdinal,
} from 'yours-wallet-provider';
import { RequestParams } from '../inject';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import type { PermissionRequest } from '@bsv/wallet-toolbox-mobile/out/src/index.client.js';
import type { ApprovalContext } from '../yoursApi';

export type Web3RequestContextProps = {
  connectRequest: RequestParams | undefined;
  sendBsvRequest: SendBsv[] | undefined;
  sendBsv20Request: SendBsv20 | undefined;
  sendMNEERequest: SendMNEE[] | undefined;
  transferOrdinalRequest: TransferOrdinal | undefined;
  purchaseOrdinalRequest: PurchaseOrdinal | undefined;
  signMessageRequest: SignMessage | undefined;
  getSignaturesRequest: GetSignatures | undefined;
  generateTaggedKeysRequest: TaggedDerivationRequest | undefined;
  encryptRequest: EncryptRequest | undefined;
  decryptRequest: DecryptRequest | undefined;
  // Permission request from WalletPermissionsManager
  permissionRequest: (PermissionRequest & { requestID: string }) | undefined;
  // Transaction approval request from YoursApi
  transactionApprovalRequest: ApprovalContext | undefined;
  popupId: number | undefined;
  getStorageAndSetRequestState: (chromeStorageService: ChromeStorageService) => void;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);
