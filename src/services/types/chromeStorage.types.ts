import {
  Addresses,
  Balance,
  NetWork,
  Ordinal,
  PubKeys,
  TaggedDerivationResponse,
  SendBsv,
  TransferOrdinal,
  PurchaseOrdinal,
  SignMessage,
  Broadcast,
  GetSignatures,
  TaggedDerivationRequest,
  EncryptRequest,
  DecryptRequest,
  SocialProfile,
} from 'yours-wallet-provider';
import { WhitelistedApp } from '../../inject';
import { Theme } from '../../theme';
import { StoredUtxo } from './bsv.types';

export type Dispatch<T> = (value: T) => void;

export type Settings = {
  noApprovalLimit: number;
  whitelist: WhitelistedApp[];
  network: NetWork;
};

export interface Account {
  name: string;
  icon: string;
  encryptedKeys: string; // See Keys type
  derivationTags: TaggedDerivationResponse[];
  settings: Settings;
  addresses: Addresses;
  balance: Balance;
  isPasswordRequired: boolean;
  ordinals: Ordinal[]; // TODO: remove
  paymentUtxos: StoredUtxo[]; // TODO: remove
  pubKeys: PubKeys;
  socialProfile: SocialProfile;
}

export type ExchangeRateCache = {
  rate: number;
  timestamp: number;
};

export type ConnectRequest = {
  appIcon: string;
  appName: string;
  domain: string;
  isAuthorized: boolean;
};

export interface ChromeStorageObject {
  accounts: { [identityAddress: string]: Account };
  selectedAccount: string;
  exchangeRateCache: ExchangeRateCache;
  lastActiveTime: number;
  popupWindowId: number;
  passKey: string;
  salt: string;
  isLocked: boolean;
  colorTheme: Theme;
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
  // [key: string]: any; // This is used to account for any additional items chrome.storage.local may return when strongly typing the chrome.storage.onChange method
}

export type CurrentAccountObject = Omit<
  ChromeStorageObject,
  | 'accounts'
  | 'selectedAccount'
  | 'popupWindowId'
  | 'connectRequest'
  | 'sendBsvRequest'
  | 'transferOrdinalRequest'
  | 'purchaseOrdinalRequest'
  | 'signMessageRequest'
  | 'broadcastRequest'
  | 'getSignaturesRequest'
  | 'generateTaggedKeysRequest'
  | 'encryptRequest'
  | 'decryptRequest'
> & { account: Account };
