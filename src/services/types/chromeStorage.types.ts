import {
  Addresses,
  Balance,
  NetWork,
  Ordinal,
  PubKeys,
  TaggedDerivationResponse,
  Broadcast,
  SocialProfile,
  MNEEBalance,
} from './provider.types';
import { Theme } from '../../theme.types';
import { StoredUtxo } from './bsv.types';

export type Settings = {
  socialProfile: SocialProfile;
  favoriteTokens: string[];
  customFeeRate: number;
  /** Auto-lock timeout in minutes. Defaults to 10. */
  lockTimeout?: number;
  /** Set to true once the user dismisses the backup storage promo for this account */
  dismissedBackupPromo?: boolean;
  /** Set to true once the user downloads their keys from the walkthrough */
  keysBackedUp?: boolean;
  /** Highest deposit address index derived so far. Defaults to 4 (5 addresses). */
  maxKeyIndex?: number;
  /**
   * Sweep migration: true once the user has either tapped the home-screen
   * migration banner OR tapped the CTA on the migration intro page. Used to
   * dismiss the home-screen banner. Per-account because each account has its
   * own legacy keys to sweep.
   */
  sweepStarted?: boolean;
  /**
   * Sweep migration: true after the user has been through the sweep flow at
   * least once for this account (Done or Skip).
   */
  sweepCompleted?: boolean;
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
 * New accounts use DEFAULT_STORAGE_REMOTE_URL as active with local as backup.
 * Absence of this field is unexpected for a healthy install.
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
  /**
   * Key epoch `encryptedKeys` was written under. Absent = 0 = password-only.
   * Bumped by every re-key (USB security enable/disable/rotate). Compared
   * against the root `keyEpoch` to detect an account a stale writer reverted.
   */
  keyEpoch?: number;
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

/** One registered USB drive. The matching secret lives only in the file on the drive. */
export interface UsbStickEntry {
  /** Matches the id inside `.yours/usb-key.json` on the drive. */
  id: string;
  /** User-given, e.g. "Blue Kingston". */
  label: string;
  /** Master factor encrypted under a key derived from this stick's secret. */
  wrappedMaster: string;
  addedAt: string;
}

/**
 * USB key security (docs/usb-key-security.md). Present only while enabled.
 * The master factor is never stored unwrapped: each stick holds one wrapper.
 */
export interface UsbSecurity {
  enabled: true;
  version: 1;
  kdfVersion: 1;
  /** HKDF(master) verifier so a recovery-code typo reads differently from a wrong password. */
  masterCheck: string;
  sticks: UsbStickEntry[];
  /** USB backup sync (OPL-4685). Absent = on, for wallets enrolled before the option existed. */
  backup?: { enabled: boolean };
}

/** Per-account record of the most recent completed USB backup, across all keys. */
export interface UsbBackupAccountStatus {
  lastBackupAt: string;
  /** Which registered keys hold a copy as of `lastBackupAt`. */
  stickIds: string[];
}

/** Written first and cleared last by the re-key routine. Other account writers refuse while set. */
export interface KeyRekeyMarker {
  fromEpoch: number;
  toEpoch: number;
  startedAt: string;
}

/**
 * Kept from the moment a re-key commits until read-back verifies every account
 * is on the new epoch. Lets a stale account be repaired at the next unlock.
 */
export interface KeyRecovery {
  toEpoch: number;
  /** Previous passKey, encrypted (v2) under the current passKey. */
  wrappedPreviousPassKey: string;
}

export type ExchangeRateCache = {
  rate: number;
  timestamp: number;
};

export interface ChromeStorageObject {
  accounts: { [identityAddress: string]: Account };
  selectedAccount: string;
  accountNumber: number;
  exchangeRateCache: ExchangeRateCache;
  lastActiveTime: number;
  popupWindowId: number;
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
  broadcastRequest?: Broadcast;
  /** USB key security; absent (or null, written by a re-key commit) when off. */
  usbSecurity?: UsbSecurity | null;
  /** Current key epoch for `accounts[*].encryptedKeys`. Absent = 0. */
  keyEpoch?: number;
  /** null is written by the re-key commit itself so the marker clears in the same set. */
  keyRekey?: KeyRekeyMarker | null;
  keyRecovery?: KeyRecovery | null;
  /** identityAddress → last USB backup. Written by the popup's sync loop. */
  usbBackupStatus?: Record<string, UsbBackupAccountStatus>;
}

export type CurrentAccountObject = Omit<ChromeStorageObject, 'accounts' | 'popupWindowId' | 'broadcastRequest'> & {
  account: Account;
};

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
  network: NetWork;
  paymentUtxos: StoredUtxo[];
  salt: string;
  colorTheme: Theme;
  popupWindowId: number;
};
