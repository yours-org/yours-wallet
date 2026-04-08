import {
  Addresses,
  Balance,
  NetWork,
  Ordinal,
  PubKeys,
  TaggedDerivationResponse,
  Broadcast,
  SocialProfile,
  SendMNEE,
  MNEEBalance,
} from 'yours-wallet-provider';
import type {
  PermissionRequest,
  GroupedPermissionRequest,
  CounterpartyPermissionRequest,
} from '@bsv/wallet-toolbox-mobile';
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
  /** BRC-29 primary receive address (index 0, "yours" prefix). Persisted on wallet init. */
  primaryAddress?: string;
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
  sendMNEERequest?: SendMNEE[];
  broadcastRequest?: Broadcast;
  // Permission requests from WalletPermissionsManager
  permissionRequest?: PermissionRequest & { requestID: string };
  groupedPermissionRequest?: GroupedPermissionRequest;
  counterpartyPermissionRequest?: CounterpartyPermissionRequest;
  // Transaction approval request from YoursApi
  transactionApprovalRequest?: ApprovalContext;
  // Sweep migration: true after user has been through the sweep flow at least once
  sweepCompleted?: boolean;
}

export type CurrentAccountObject = Omit<
  ChromeStorageObject,
  | 'accounts'
  | 'popupWindowId'
  | 'connectRequest'
  | 'sendMNEERequest'
  | 'broadcastRequest'
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
