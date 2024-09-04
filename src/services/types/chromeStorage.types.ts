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
  isPasswordRequired: boolean;
  socialProfile: SocialProfile;
};

export interface Account {
  name: string;
  icon: string;
  network: NetWork;
  encryptedKeys: string; // See Keys type
  derivationTags: TaggedDerivationResponse[];
  settings: Settings;
  addresses: Addresses;
  balance: Balance;
  pubKeys: PubKeys;
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
  version?: number;
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
}

export type CurrentAccountObject = Omit<
  ChromeStorageObject,
  | 'accounts'
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

type AppState = {
  addresses: Addresses;
  balance: Balance;
  isLocked: boolean;
  isPasswordRequired: boolean;
  network: NetWork;
  ordinals: Ordinal[];
  pubKeys: PubKeys;
};

export type DeprecatedStorage = {
  appState: AppState;
  derivationTags: TaggedDerivationResponse[];
  encryptedKeys: string;
  exchangeRateCache: ExchangeRateCache;
  socialProfile: SocialProfile;
  noApprovalLimit: number;
  lastActiveTime: number;
  passKey: string;
  network: NetWork;
  paymentUtxos: StoredUtxo[];
  salt: string;
  whitelist: WhitelistedApp[];
  colorTheme: Theme;
  popupWindowId: number;
};
