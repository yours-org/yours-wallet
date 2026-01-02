import { NetWork } from 'yours-wallet-provider';
import {
  OneSatServices,
  AddressManager,
  SyncProcessor,
  type SyncProcessorEvents,
  type IndexedDbSyncQueue,
} from '@1sat/wallet-toolbox';
import { initSyncContext } from './initSyncContext';
import {
  Wallet,
  WalletStorageManager,
  StorageProvider,
  StorageIdb,
  WalletPermissionsManager,
  type sdk as toolboxSdk,
  type PermissionsManagerConfig,
} from '@bsv/wallet-toolbox-mobile/out/src/index.client.js';
import { KeyDeriver, PrivateKey } from '@bsv/sdk';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { decrypt } from './utils/crypto';
import type { Keys } from './utils/keys'; // Used by decryptKeys

// Type alias for chain
type Chain = 'main' | 'test';

// WalletServices type from wallet-toolbox-mobile
type WalletServices = toolboxSdk.WalletServices;

// Admin originator for the extension (bypasses all permission checks)
// Uses chrome-extension://<id> format to match what ChromeCWI sends
const ADMIN_ORIGINATOR = `chrome-extension://${chrome.runtime.id}`;

// Default permissions config for yours-wallet
// Extension UI (admin) bypasses all checks, but we still enable checks for external apps
const DEFAULT_PERMISSIONS_CONFIG: PermissionsManagerConfig = {
  // Protocol permissions - require for external apps
  seekProtocolPermissionsForSigning: true,
  seekProtocolPermissionsForEncrypting: true,
  seekProtocolPermissionsForHMAC: true,
  seekPermissionsForKeyLinkageRevelation: true,
  seekPermissionsForPublicKeyRevelation: false, // Public keys aren't sensitive
  seekPermissionsForIdentityKeyRevelation: true,
  seekPermissionsForIdentityResolution: true,

  // Basket permissions - skip for internal ops, require for external
  seekBasketInsertionPermissions: true,
  seekBasketRemovalPermissions: true,
  seekBasketListingPermissions: false, // Listing isn't sensitive

  // Label permissions
  seekPermissionWhenApplyingActionLabels: false,
  seekPermissionWhenListingActionsByLabel: false,

  // Certificate permissions
  seekCertificateDisclosurePermissions: true,
  seekCertificateAcquisitionPermissions: true,
  seekCertificateRelinquishmentPermissions: true,
  seekCertificateListingPermissions: false,

  // Metadata encryption - keep wallet data private
  encryptWalletMetadata: true,

  // Spending permissions - always require for external apps
  seekSpendingPermissions: true,

  // Grouped permissions (BRC-73)
  seekGroupedPermission: false, // We'll use individual prompts for now

  // Distinguish privileged operations
  differentiatePrivilegedOperations: true,
};

/**
 * Initialize storage for a wallet
 */
const initStorage = async (
  chain: Chain,
  identityPubKey: string,
  selectedAccount: string,
): Promise<{ storage: WalletStorageManager; storageProvider: StorageIdb }> => {
  const storageOptions = StorageProvider.createStorageBaseOptions(chain);
  const storageProvider = new StorageIdb(storageOptions);
  const storage = new WalletStorageManager(identityPubKey, storageProvider);

  await storageProvider.migrate(`wallet-${selectedAccount || ''}`, identityPubKey);
  await storageProvider.makeAvailable();

  return { storage, storageProvider };
};

/**
 * Decrypt keys from chrome storage using the stored passKey.
 * Throws if account or passKey is missing (caller should ensure authentication first).
 */
const decryptKeys = (chromeStorageService: ChromeStorageService): Keys => {
  const { account, passKey } = chromeStorageService.getCurrentAccountObject();

  if (!account?.encryptedKeys) {
    throw new Error('No account found - wallet not initialized');
  }
  if (!passKey) {
    throw new Error('No passKey found - user not authenticated');
  }

  const decrypted = decrypt(account.encryptedKeys, passKey);
  return JSON.parse(decrypted) as Keys;
};

/**
 * Account context containing wallet, sync components, and services.
 * All components share the same lifecycle (account-specific).
 *
 * The syncQueue and services are exposed so the UI can create a SyncFetcher
 * to populate the queue via SSE, while the service worker runs the SyncProcessor
 * to process the queue.
 */
export interface AccountContext {
  wallet: WalletPermissionsManager;
  underlyingWallet: Wallet;
  syncProcessor: SyncProcessor;
  syncQueue: IndexedDbSyncQueue;
  services: OneSatServices;
  addressManager: AddressManager;
}

// Re-export SyncProcessorEvents for use in background.ts
export type { SyncProcessorEvents };

/**
 * Initialize the Wallet instance wrapped with WalletPermissionsManager.
 *
 * This creates a signing-capable Wallet using keys from chrome storage.
 * Throws if account or passKey is missing (caller should ensure authentication first).
 *
 * Call this after user authentication (unlock).
 */
export const initWallet = async (
  chromeStorageService: ChromeStorageService,
): Promise<AccountContext> => {
  // Ensure storage is loaded
  await chromeStorageService.getAndSetStorage();

  // Decrypt keys - throws if account or passKey is missing
  const keys = decryptKeys(chromeStorageService);
  if (!keys.identityWif) {
    throw new Error('No identity key found in decrypted keys');
  }

  const { selectedAccount } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();
  const chain: Chain = network === NetWork.Mainnet ? 'main' : 'test';

  // Create signing key deriver from identity key
  const identityKey = PrivateKey.fromWif(keys.identityWif);
  const identityPubKey = identityKey.toPublicKey().toString();
  const keyDeriver = new KeyDeriver(identityKey);

  // Create storage
  const { storage } = await initStorage(chain, identityPubKey, selectedAccount || '');

  // Create OneSatServices first (needed for Wallet creation)
  const services = new OneSatServices(chain);

  // Create the BRC-100 Wallet with signing capability
  // Type assertion needed because OneSatServices is built against @bsv/wallet-toolbox
  // but we're using @bsv/wallet-toolbox-mobile. The interfaces are structurally identical.
  const underlyingWallet = new Wallet({
    chain,
    keyDeriver,
    storage,
    services: services as unknown as WalletServices,
  });

  // Wrap with WalletPermissionsManager for permission handling
  // Admin originator (the extension) bypasses all permission checks
  const wallet = new WalletPermissionsManager(
    underlyingWallet,
    ADMIN_ORIGINATOR,
    DEFAULT_PERMISSIONS_CONFIG,
  );

  // Initialize sync context
  // TODO: Load maxKeyIndex from chrome.storage, for now use 5 addresses
  const maxKeyIndex = 4; // 0-4 = 5 addresses
  const syncContext = await initSyncContext({
    wallet,
    chain,
    accountId: selectedAccount || '',
    maxKeyIndex,
  });

  const { syncQueue, addressManager } = syncContext;

  // Create SyncProcessor for queue processing (runs in service worker)
  const syncProcessor = new SyncProcessor({
    wallet,
    services,
    syncQueue,
    addressManager,
    network: chain === 'main' ? 'mainnet' : 'testnet',
  });

  return {
    wallet,
    underlyingWallet,
    syncProcessor,
    syncQueue,
    services,
    addressManager,
  };
};

/**
 * Close/destroy an account context
 */
export const closeAccountContext = async (accountContext: AccountContext | null): Promise<void> => {
  if (accountContext?.underlyingWallet) {
    await accountContext.underlyingWallet.destroy();
  }
};
