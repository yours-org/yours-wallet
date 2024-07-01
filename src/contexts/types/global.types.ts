import {
  Addresses,
  Balance,
  NetWork,
  Ordinal,
  PubKeys,
  TaggedDerivationResponse,
  Utxo,
  SendBsv,
  TransferOrdinal,
  PurchaseOrdinal,
  SignMessage,
  Broadcast,
  GetSignatures,
  TaggedDerivationRequest,
  EncryptRequest,
  DecryptRequest,
} from 'yours-wallet-provider';
import { WhitelistedApp } from '../../inject';

// TODO: multi account
// interface Account {
//     identityPubKey: string;
//     name: string;
//     icon: string;
// }

interface AppState {
  addresses: Addresses;
  balance: Balance;
  isLocked: boolean;
  isPasswordRequired: boolean;
  network: NetWork;
  ordinals: Ordinal[];
  pubKeys: PubKeys;
}

type ExchangeRateCache = {
  rate: number;
  timestamp: number;
};

type ConnectRequest = {
  appIcon: string;
  appName: string;
  domain: string;
  isAuthorized: boolean;
};

export interface ChromeStorageObject {
  appState: AppState;
  derivationTags: TaggedDerivationResponse[];
  encryptedKeys: string; // stringified Keys object (hint: search for "Keys" type)
  exchangeRateCache: ExchangeRateCache;
  lastActiveTime: number;
  passKey: string;
  paymentUtxos: Utxo[];
  popupWindowId: number;
  salt: string;
  whitelist: WhitelistedApp[];
  connectRequest?: ConnectRequest;
  sendBsvRequest?: SendBsv[];
  transferOrdinalRequest?: TransferOrdinal;
  purchaseOrdinalRequest?: PurchaseOrdinal;
  signMessageRequest?: SignMessage;
  broadcastRequest?: Broadcast;
  getSignaturesRequest?: GetSignatures;
  generateTaggedKeysRequest?: TaggedDerivationRequest;
  encryptRequest?: EncryptRequest;
  decryptRequest?: DecryptRequest;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // This is used to account for any additional items chrome.storage.local may return when strongly typing the chrome.storage.onChange method
}
