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
  whitelist: WhitelistedApp[];
  socialProfile: SocialProfile;
  favoriteTokens: string[];
  customFeeRate: number;
  /** Auto-lock timeout in minutes. Defaults to 10. */
  lockTimeout?: number;
  /** Set to true once the user dismisses the backup storage promo for this account */
  dismissedBackupPromo?: boolean;
  /** Set to true once the user downloads their keys from the walkthrough */
  keysBackedUp?: boolean;
};

/**
 * Per-account storage configuration.
 *
 * `activeRemote` is a pointer: when set, it names which URL in `remotes[]`
 * is the active store; when undefined, local storage is active.
 *
 * `remotes[]` is the full list of configured remote URLs. A URL being active
 * does not remove it from this list — add/remove and set-active are separate
 * operations.
 *
 * Absence of this field means "implicit default" — treated as remote-active
 * against the hardcoded provider URL so existing accounts keep their prior
 * behavior until the user explicitly configures storage.
 */
export type StorageConfig = {
  activeRemote?: string;
  remotes?: string[];
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
  storageConfig?: StorageConfig;
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
  passKey?: string;
  salt: string;
  isLocked: boolean;
  colorTheme: Theme;
  version?: number;
  deviceId?: string;
  /**
   * Per-install random identifier used as the local IndexedDB's
   * `storageIdentityKey`. Distinguishes this install's local store from
   * other installs of the same account on the shared remote, so
   * `WalletStorageManager` can correctly identify which local is the
   * authoritative active store. Generated on first unlock.
   */
  storageIdentityKey?: string;
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
  lastActiveTime: number;
  passKey: string;
  network: NetWork;
  paymentUtxos: StoredUtxo[];
  salt: string;
  whitelist: WhitelistedApp[];
  colorTheme: Theme;
  popupWindowId: number;
};
