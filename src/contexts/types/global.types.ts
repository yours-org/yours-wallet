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

export type Dispatch<T> = (value: T) => void;

interface Account {
  name: string;
  icon: string;
  encryptedKeys: string; // See Keys type
  derivationTags: TaggedDerivationResponse[];
  whitelist: WhitelistedApp[];
}

export interface AppState {
  addresses: Addresses;
  balance: Balance;
  isLocked: boolean;
  isPasswordRequired: boolean;
  network: NetWork;
  ordinals: Ordinal[]; // TODO: remove
  pubKeys: PubKeys;
}

export type ExchangeRateCache = {
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
  accounts: { [identityAddress: string]: Account };
  selectedAccount: string;
  exchangeRateCache: ExchangeRateCache;
  lastActiveTime: number;
  passKey: string;
  paymentUtxos: Utxo[]; // TODO: remove
  popupWindowId: number;
  salt: string;
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
