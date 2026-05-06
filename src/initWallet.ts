import {
  createWebWallet,
  createIndexedDbTaskStateStore,
  type WebWalletConfig,
  YOURS_PREFIX,
  Wallet,
  WalletStorageManager,
  StorageClient,
  LocalWalletPermissionsManager,
  IndexedDbPermissionStore,
} from '@1sat/wallet-browser';
import { syncAddresses, syncCosignDeliveries, createContext as createActionContext } from '@1sat/actions';
import { ChromeStorageService } from './services/ChromeStorage.service';
import type { Account, StorageConfig } from './services/types/chromeStorage.types';
import { decrypt } from './utils/crypto';
import type { Keys } from './utils/keys';
import { initSyncContext, type SyncContext } from './initSyncContext';

// Admin originator for the extension (bypasses all permission checks)
// Uses chrome-extension://<id> format to match what ChromeCWI sends
const ADMIN_ORIGINATOR = `chrome-extension://${chrome.runtime.id}`;

/**
 * Decrypt keys from chrome storage using the passKey from session storage.
 * Throws if account or passKey is missing (caller should ensure authentication first).
 */
const decryptKeys = async (chromeStorageService: ChromeStorageService): Promise<Keys> => {
  const { account } = chromeStorageService.getCurrentAccountObject();
  const passKey = await chromeStorageService.getPassKey();

  if (!account?.encryptedKeys) {
    throw new Error('No account found - wallet not initialized');
  }
  if (!passKey) {
    throw new Error('No passKey found - user not authenticated');
  }

  const decrypted = await decrypt(account.encryptedKeys, passKey);
  return JSON.parse(decrypted) as Keys;
};

/**
 * Account context containing wallet and necessary sync components.
 * All components share the same lifecycle (account-specific).
 */
export interface AccountContext {
  wallet: LocalWalletPermissionsManager;
  baseWallet: Wallet;
  syncContext: SyncContext;
  storage: WalletStorageManager;
  remoteStorage?: StorageClient;
  setActiveStorage: (target: 'local' | string) => Promise<void>;
  addRemote: (url: string) => Promise<void>;
  /** Call to stop sync and destroy wallet */
  close: () => Promise<void>;
}

/**
 * Resolve a per-account storage config into the flat fields the SDK factory
 * expects. Accounts predating per-account storage config (`storageConfig`
 * undefined) get the hardcoded remote-active behavior so their unlock path
 * is unchanged.
 */
const resolveStorageConfig = (
  storageConfig: StorageConfig | undefined,
): { activeRemote?: string; backups?: string[] } => {
  if (!storageConfig) {
    // No storage config — this is a pre-migration account that was previously
    // syncing to the default remote. Return local-only; the user can add
    // remotes from the provider list.
    return {};
  }
  const { activeRemote, remotes = [] } = storageConfig;
  // `remotes[]` holds every configured remote including the active; filter
  // the active out before passing to the factory so it doesn't double-connect.
  const backups = activeRemote ? remotes.filter((url) => url !== activeRemote) : remotes;
  return { activeRemote, backups };
};

/**
 * Read the per-install storageIdentityKey from chrome storage, generating
 * and persisting a new random value on first use. Shared across all
 * accounts on this install — the identity is a property of the local
 * IndexedDB, not of any individual account. Distinct from other installs
 * of the same account on the same remote so `WalletStorageManager` can
 * correctly identify which local store is authoritative.
 */
const ensureStorageIdentityKey = async (chromeStorageService: ChromeStorageService): Promise<string> => {
  const existing = chromeStorageService.getCurrentAccountObject().storageIdentityKey;
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const key = `yours-${hex}`;
  await chromeStorageService.update({ storageIdentityKey: key });
  return key;
};

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
  const keys = await decryptKeys(chromeStorageService);
  if (!keys.identityWif) {
    throw new Error('No identity key found in decrypted keys');
  }

  const chain = 'main' as const;

  // 2. Create wallet using browser factory. Storage topology comes from the
  // current account's persisted storageConfig (or implicit default for
  // pre-existing accounts that have none yet). storageIdentityKey is
  // per-install and lazily materialized.
  const { account } = chromeStorageService.getCurrentAccountObject();
  const { activeRemote, backups } = resolveStorageConfig(account?.storageConfig);
  const storageIdentityKey = await ensureStorageIdentityKey(chromeStorageService);

  const walletConfig: WebWalletConfig = {
    privateKey: keys.identityWif,
    chain,
    feeModel: { model: 'sat/kb', value: chromeStorageService.getCustomFeeRate() },
    activeRemote,
    backups,
    storageIdentityKey,
    taskStateStore: createIndexedDbTaskStateStore(),
  };

  const {
    wallet: baseWallet,
    destroy: destroyWallet,
    storage,
    remoteStorage,
    setActiveStorage,
    addRemote,
  } = await createWebWallet(walletConfig);

  // 3. Wrap with permissions manager for external app access control.
  // Grants persist in IndexedDB (off-chain) via LocalWalletPermissionsManager.
  const wallet = new LocalWalletPermissionsManager(
    baseWallet,
    ADMIN_ORIGINATOR,
    {},
    { store: new IndexedDbPermissionStore({ scope: 'yours-wallet' }) },
  );

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

  // 6. Pull any cosign-wrapped BSV21 deliveries from the messagebox.
  // Fire-and-forget; failure here doesn't block wallet init.
  syncCosignDeliveries
    .execute(actionCtx, {})
    .then((result) => {
      console.log('[initWallet] Cosign deliveries sync complete:', result);
    })
    .catch((error: unknown) => {
      console.error(
        '[initWallet] Cosign deliveries sync failed:',
        error instanceof Error ? error.message : String(error),
      );
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
    setActiveStorage,
    addRemote,
    close,
  };
};
