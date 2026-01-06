import { NetWork } from 'yours-wallet-provider';
import { SyncProcessor } from '@1sat/wallet-toolbox';
import {
  Wallet,
  WalletStorageManager,
  StorageProvider,
  StorageIdb,
  StorageClient,
  WalletPermissionsManager,
  Services,
  Monitor,
  type sdk as toolboxSdk,
  type PermissionsManagerConfig,
} from '@bsv/wallet-toolbox-mobile/out/src/index.client.js';
import { KeyDeriver, PrivateKey, type WalletInterface } from '@bsv/sdk';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { decrypt } from './utils/crypto';
import type { Keys } from './utils/keys';
import { FEE_PER_KB } from './utils/constants';
import { initSyncContext, type SyncContext } from './initSyncContext';

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

// Timeout for remote storage connection attempts (ms)
const REMOTE_STORAGE_TIMEOUT = 5000;

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
 * Account context containing wallet and necessary sync components.
 * All components share the same lifecycle (account-specific).
 */
export interface AccountContext {
  wallet: WalletPermissionsManager;
  syncContext: SyncContext;
  /** Whether remote storage backup is connected */
  remoteStorageConnected: boolean;
  /** Call to stop sync and destroy wallet */
  close: () => Promise<void>;
}

export interface InitWalletOptions {
  onTransactionBroadcasted?: (txid: string) => void;
  onTransactionProven?: (txid: string) => void;
}

/**
 * Initialize the Wallet instance with all sync components.
 *
 * This creates a signing-capable Wallet using keys from chrome storage,
 * then wires up all sync infrastructure (SyncProcessor, Monitor).
 *
 * Throws if account or passKey is missing (caller should ensure authentication first).
 * Call this after user authentication (unlock).
 */
export const initWallet = async (
  chromeStorageService: ChromeStorageService,
  options?: InitWalletOptions,
): Promise<AccountContext> => {
  // Ensure storage is loaded
  await chromeStorageService.getAndSetStorage();

  // 1. BROWSER-SPECIFIC: Decrypt keys
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

  // 2. Create fallback services (wallet-toolbox-mobile Services for APIs we don't implement)
  const fallbackServices = new Services(chain);

  // 3. Import OneSatServices to create proper services with fallback
  const { OneSatServices } = await import('@1sat/wallet-toolbox');
  const oneSatServices = new OneSatServices(chain, undefined, fallbackServices as unknown as WalletServices);

  // 4. Create local storage first (needed before wallet, but wallet needed for remote auth)
  const storageOptions = StorageProvider.createStorageBaseOptions(chain);
  storageOptions.feeModel = { model: 'sat/kb', value: FEE_PER_KB };
  const localStorageProvider = new StorageIdb(storageOptions);
  await localStorageProvider.migrate(`wallet-${selectedAccount || ''}`, identityPubKey);

  // 5. Create initial wallet with local-only storage (needed for remote storage auth)
  const localOnlyStorage = new WalletStorageManager(identityPubKey, localStorageProvider);
  await localOnlyStorage.makeAvailable();

  const underlyingWallet = new Wallet({
    chain,
    keyDeriver,
    storage: localOnlyStorage,
    services: oneSatServices as unknown as WalletServices,
  });

  // 6. Try to connect remote storage for backup (graceful degradation)
  // Access storageUrl via type assertion since it's dynamically imported
  const storageUrl = (oneSatServices as unknown as { storageUrl: string }).storageUrl;
  let remoteStorageConnected = false;
  try {
    console.log('[initWallet] Attempting to connect to remote storage:', storageUrl);
    const remoteClient = new StorageClient(underlyingWallet as unknown as WalletInterface, storageUrl);

    // Test connection with a timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Remote storage connection timeout')), REMOTE_STORAGE_TIMEOUT)
    );
    await Promise.race([remoteClient.makeAvailable(), timeoutPromise]);

    // Remote connected - add it as a backup to the storage manager
    // Note: We need to add the backup after initial setup
    // For now, we'll recreate the storage manager with the remote backup
    const storageWithRemote = new WalletStorageManager(identityPubKey, localStorageProvider, [remoteClient]);
    await storageWithRemote.makeAvailable();

    // Update the wallet's storage reference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (underlyingWallet as any)._storage = storageWithRemote;

    remoteStorageConnected = true;
    console.log('[initWallet] Remote storage connected successfully');
  } catch (error) {
    console.warn('[initWallet] Remote storage unavailable, continuing with local only:', error);
  }

  // 7. Wrap with WalletPermissionsManager for permission handling
  const wallet = new WalletPermissionsManager(
    underlyingWallet,
    ADMIN_ORIGINATOR,
    DEFAULT_PERMISSIONS_CONFIG,
  );

  // 6. Initialize sync context (derives addresses, creates services, queue, addressManager)
  const maxKeyIndex = 4; // 0-4 = 5 addresses
  const syncContext = await initSyncContext({
    wallet,
    chain,
    accountId: selectedAccount || '',
    maxKeyIndex,
  });

  const { services, syncQueue, addressManager } = syncContext;

  // 7. Create SyncProcessor (processes external payments from queue)
  const processor = new SyncProcessor({
    wallet,
    services,
    syncQueue,
    addressManager,
    network: chain === 'main' ? 'mainnet' : 'testnet',
  });

  // Subscribe to processor events and forward to popup
  const sendSyncStatus = (data: { status: string; [key: string]: unknown }) => {
    chrome.runtime.sendMessage({
      action: 'syncStatusUpdate',
      data,
    }).catch(() => {
      // Ignore errors if popup is not open
    });
  };

  processor.on('process:start', () => {
    sendSyncStatus({ status: 'start', addressCount: maxKeyIndex + 1 });
  });

  processor.on('process:progress', (data) => {
    sendSyncStatus({ status: 'progress', ...data });
  });

  processor.on('process:complete', () => {
    sendSyncStatus({ status: 'complete' });
  });

  processor.on('process:error', (data) => {
    sendSyncStatus({ status: 'error', message: data.message });
  });

  // 9. Create Monitor (transaction lifecycle: broadcast/proof)
  // Use OneSatServices which wraps fallbackServices for 1Sat API
  // TODO: Remove cast after bsv-blockchain/wallet-toolbox#104 is merged
  const monitor = new Monitor({
    chain,
    services: oneSatServices as unknown as typeof fallbackServices,
    storage: localOnlyStorage,
    chaintracks: services.chaintracks,
    msecsWaitPerMerkleProofServiceReq: 500,
    taskRunWaitMsecs: 5000,
    abandonedMsecs: 1000 * 60 * 5, // 5 minutes
    unprovenAttemptsLimitTest: 10,
    unprovenAttemptsLimitMain: 144,
    onTransactionProven: options?.onTransactionProven
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? async (status: any) => {
          console.log('[Monitor] Transaction proven:', status.txid);
          options.onTransactionProven!(status.txid);
        }
      : undefined,
    onTransactionBroadcasted: options?.onTransactionBroadcasted
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? async (result: any) => {
          console.log('[Monitor] Transaction broadcasted:', result);
          if (result.txid) {
            options.onTransactionBroadcasted!(result.txid);
          }
        }
      : undefined,
  });

  // 10. Start sync operations (don't await - let them run in background)
  console.log('[initWallet] Starting processor...');
  processor.start().catch((error) => {
    console.error('[initWallet] Failed to start processor:', error);
  });
  console.log('[initWallet] Adding default tasks to monitor...');
  monitor.addDefaultTasks();
  console.log('[initWallet] Starting monitor tasks...');
  // Don't await startTasks - it runs continuously and never resolves
  monitor.startTasks().catch((error) => {
    console.error('[initWallet] Monitor tasks error:', error);
  });
  console.log('[initWallet] Returning context');

  // Create close function that captures processor and monitor
  const close = async () => {
    processor.stop();
    monitor.stopTasks();
    await monitor.destroy();
    await underlyingWallet.destroy();
  };

  return {
    wallet,
    syncContext,
    remoteStorageConnected,
    close,
  };
};
