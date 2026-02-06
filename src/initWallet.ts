import { NetWork } from 'yours-wallet-provider';
import {
  AddressSyncProcessor,
  createWebWallet,
  type FullSyncResult,
  type FullSyncStage,
  type WebWalletConfig,
} from '@1sat/wallet-browser';
import { WalletPermissionsManager, type PermissionsManagerConfig } from '@bsv/wallet-toolbox-mobile';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { decrypt } from './utils/crypto';
import type { Keys } from './utils/keys';
import { FEE_PER_KB } from './utils/constants';
import { initSyncContext, type SyncContext } from './initSyncContext';

// Type alias for chain
type Chain = 'main' | 'test';

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
  /** Full sync with remote storage (push/pull) */
  fullSync?: (onProgress?: (stage: FullSyncStage, message: string) => void) => Promise<FullSyncResult>;
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

  const deviceId = chromeStorageService.storage?.deviceId;
  if (!deviceId) {
    throw new Error('No deviceId found in storage - migration may not have run');
  }

  // 2. Create wallet using factory
  const walletConfig: WebWalletConfig = {
    privateKey: keys.identityWif,
    chain,
    feeModel: { model: 'sat/kb', value: FEE_PER_KB },
    remoteStorageUrl: chain === 'main'
      ? 'https://1sat.shruggr.cloud/1sat/wallet'
      : 'https://testnet.api.1sat.app/1sat/wallet',
    storageIdentityKey: deviceId,
    onTransactionBroadcasted: options?.onTransactionBroadcasted,
    onTransactionProven: options?.onTransactionProven
      ? (txid, _blockHeight) => options.onTransactionProven!(txid)
      : undefined,
  };

  const {
    wallet: baseWallet,
    monitor,
    destroy: destroyWallet,
    fullSync,
  } = await createWebWallet(walletConfig);

  // 3. Wrap with permissions manager for external app access control
  const wallet = new WalletPermissionsManager(
    baseWallet,
    ADMIN_ORIGINATOR,
    DEFAULT_PERMISSIONS_CONFIG,
  );

  // 4. Initialize sync context (derives addresses, creates services, queue, addressManager)
  const maxKeyIndex = 4; // 0-4 = 5 addresses
  const syncContext = await initSyncContext({
    wallet,
    chain,
    accountId: selectedAccount || '',
    maxKeyIndex,
  });

  const { services, syncQueue, addressManager } = syncContext;

  // 5. Create AddressSyncProcessor (processes external payments from queue)
  const processor = new AddressSyncProcessor({
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

  // 6. Start sync operations (don't await - let them run in background)
  // Note: Monitor callbacks (onTransactionBroadcasted/onTransactionProven) are
  // configured in walletConfig above. The factory handles remote sync first,
  // then calls our callbacks.
  console.log('[initWallet] Starting processor...');
  processor.start().catch((error: unknown) => {
    console.error('[initWallet] Failed to start processor:', error);
  });
  console.log('[initWallet] Starting monitor tasks...');
  monitor.startTasks().catch((error: unknown) => {
    console.error('[initWallet] Monitor tasks error:', error);
  });
  console.log('[initWallet] Returning context');

  // Create close function
  const close = async () => {
    processor.stop();
    await destroyWallet();
  };

  return {
    wallet,
    syncContext,
    remoteStorageConnected: !!fullSync,
    fullSync,
    close,
  };
};
