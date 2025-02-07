import { createContext } from 'react';
import {
  Broadcast,
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  PurchaseOrdinal,
  SendBsv,
  SendBsv20,
  SignMessage,
  TaggedDerivationRequest,
  TransferOrdinal,
} from 'yours-wallet-provider';
import { RequestParams } from '../inject';
import { ChromeStorageService } from '../services/ChromeStorage.service';

export type Web3RequestContextProps = {
  connectRequest: RequestParams | undefined;
  sendBsvRequest: SendBsv[] | undefined;
  sendBsv20Request: SendBsv20 | undefined;
  transferOrdinalRequest: TransferOrdinal | undefined;
  purchaseOrdinalRequest: PurchaseOrdinal | undefined;
  signMessageRequest: SignMessage | undefined;
  broadcastRequest: Broadcast | undefined;
  getSignaturesRequest: GetSignatures | undefined;
  generateTaggedKeysRequest: TaggedDerivationRequest | undefined;
  encryptRequest: EncryptRequest | undefined;
  decryptRequest: DecryptRequest | undefined;
  popupId: number | undefined;
  getStorageAndSetRequestState: (chromeStorageService: ChromeStorageService) => void;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);
