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
  SendBsv20,
  SendMNEE,
  MNEEBalance,
} from 'yours-wallet-provider';
import type { PermissionRequest } from '@bsv/wallet-toolbox-mobile/out/src/index.client.js';
import { WhitelistedApp } from '../../inject';
import { Theme } from '../../theme.types';
import { StoredUtxo } from './bsv.types';
import type { ApprovalContext } from '../../yoursApi';

export type Dispatch<T> = (value: T) => void;

export type Settings = {
  noApprovalLimit: number;
  whitelist: WhitelistedApp[];
  isPasswordRequired: boolean;
  socialProfile: SocialProfile;
  favoriteTokens: string[];
  customFeeRate: number;
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
  mneeBalance: MNEEBalance;
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
  accountNumber: number;
  exchangeRateCache: ExchangeRateCache;
  lastActiveTime: number;
  popupWindowId: number;
  passKey: string;
  salt: string;
  isLocked: boolean;
  colorTheme: Theme;
  version?: number;
  deviceId?: string;
  showWelcome?: boolean;
  connectRequest?: ConnectRequest;
  sendBsvRequest?: SendBsv[];
  sendBsv20Request?: SendBsv20;
  sendMNEERequest?: SendMNEE[];
  transferOrdinalRequest?: TransferOrdinal;
  purchaseOrdinalRequest?: PurchaseOrdinal;
  signMessageRequest?: SignMessage;
  broadcastRequest?: Broadcast;
  getSignaturesRequest?: GetSignatures;
  generateTaggedKeysRequest?: TaggedDerivationRequest;
  encryptRequest?: EncryptRequest;
  decryptRequest?: DecryptRequest;
  // Permission request from WalletPermissionsManager
  permissionRequest?: PermissionRequest & { requestID: string };
  // Transaction approval request from YoursApi
  transactionApprovalRequest?: ApprovalContext;
}

export type CurrentAccountObject = Omit<
  ChromeStorageObject,
  | 'accounts'
  | 'popupWindowId'
  | 'connectRequest'
  | 'sendBsvRequest'
  | 'sendBsv20Request'
  | 'sendMNEERequest'
  | 'transferOrdinalRequest'
  | 'purchaseOrdinalRequest'
  | 'signMessageRequest'
  | 'broadcastRequest'
  | 'getSignaturesRequest'
  | 'generateTaggedKeysRequest'
  | 'encryptRequest'
  | 'decryptRequest'
  | 'permissionRequest'
  | 'transactionApprovalRequest'
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
