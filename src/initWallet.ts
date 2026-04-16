import { NetWork } from 'yours-wallet-provider';
import {
  createWebWallet,
  type WebWalletConfig,
  YOURS_PREFIX,
  Wallet,
  WalletStorageManager,
  StorageClient,
} from '@1sat/wallet-browser';
import { syncAddresses, createContext as createActionContext } from '@1sat/actions';
import { WalletPermissionsManager, type PermissionsManagerConfig } from '@bsv/wallet-toolbox-mobile';
import { ChromeStorageService } from './services/ChromeStorage.service';
import type { Account } from './services/types/chromeStorage.types';
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
  seekGroupedPermission: true,

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
  baseWallet: Wallet;
  syncContext: SyncContext;
  storage: WalletStorageManager;
  remoteStorage?: StorageClient;
  migrateRemote: (url: string) => Promise<void>;
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
 * Uses remote storage as the sole storage backend — no local IndexedDB.
 * The server handles transaction lifecycle (broadcasting, proof checking).
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

  const network = chromeStorageService.getNetwork();
  const chain: Chain = network === NetWork.Mainnet ? 'main' : 'test';

  // 2. Create wallet using browser factory
  const walletConfig: WebWalletConfig = {
    privateKey: keys.identityWif,
    chain,
    feeModel: { model: 'sat/kb', value: FEE_PER_KB },
    activeRemote: chain === 'main' ? 'https://api.1sat.app/1sat/wallet' : 'https://testnet.api.1sat.app/1sat/wallet',
    storageIdentityKey: 'yours-wallet',
  };

  const {
    wallet: baseWallet,
    destroy: destroyWallet,
    storage,
    remoteStorage,
    migrateRemote,
  } = await createWebWallet(walletConfig);

  // 3. Wrap with permissions manager for external app access control
  const wallet = new WalletPermissionsManager(baseWallet, ADMIN_ORIGINATOR, DEFAULT_PERMISSIONS_CONFIG);

  // 4. Initialize sync context (derives addresses, creates services, queue, addressManager)
  const maxKeyIndex = 4; // 0-4 = 5 addresses
  const syncContext = await initSyncContext({
    wallet,
    chain,
    maxKeyIndex,
  });

  // 4b. Persist the BRC-29 primary address so other accounts can display it in the UI.
  // updateNested does a deepMerge under the hood, so a partial { primaryAddress } patch
  // is safe even though TS sees it as missing required Account fields.
  const primaryAddress = syncContext.addressManager.getPrimaryAddress();
  if (primaryAddress) {
    const identityAddress = keys.identityAddress;
    chromeStorageService.updateNested('accounts', {
      [identityAddress]: { primaryAddress } as unknown as Account,
    });
  }

  // 5. Run address sync via syncAddresses action (fire-and-forget)
  const actionCtx = createActionContext(baseWallet, { chain, services: syncContext.services });

  const sendSyncStatus = (data: { status: string; [key: string]: unknown }) => {
    chrome.runtime
      .sendMessage({
        action: 'syncStatusUpdate',
        data,
      })
      .catch(() => {
        // Ignore errors if popup is not open
      });
  };

  console.log('[initWallet] Starting address sync...');
  sendSyncStatus({ status: 'start', addressCount: maxKeyIndex + 1 });

  syncAddresses
    .execute(actionCtx, {
      prefix: YOURS_PREFIX,
      count: maxKeyIndex + 1,
      onProgress: (progress) => {
        sendSyncStatus({ status: 'progress', ...progress });
      },
    })
    .then((result) => {
      sendSyncStatus({ status: 'complete', ...result });
      console.log('[initWallet] Address sync complete:', result);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      sendSyncStatus({ status: 'error', message });
      console.error('[initWallet] Address sync failed:', error);
    });

  // Create close function
  const close = async () => {
    await destroyWallet();
  };

  return {
    wallet,
    baseWallet,
    syncContext,
    storage,
    remoteStorage,
    migrateRemote,
    close,
  };
};
