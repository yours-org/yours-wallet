import { NetWork } from 'yours-wallet-provider';
import {
  OneSatWallet,
  IndexedDbSyncQueue,
  WalletStorageManager,
  StorageProvider,
  StorageIdb,
} from '@1sat/wallet-toolbox';
import { PrivateKey } from '@bsv/sdk';
import { YoursEventName } from './inject';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { sendMessage } from './utils/chromeHelpers';
import type { Keys } from './utils/keys';

// Default public key for when no account exists (PrivateKey = 1)
const DEFAULT_PUBKEY = PrivateKey.fromString('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
  .toPublicKey()
  .toString();

/**
 * Get the set of owner addresses for this account
 */
export const getOwners = (chromeStorageService: ChromeStorageService): Set<string> => {
  const { account } = chromeStorageService.getCurrentAccountObject();
  const { bsvAddress, identityAddress, ordAddress } = account?.addresses || {};
  return new Set<string>([bsvAddress, identityAddress, ordAddress].filter(Boolean) as string[]);
};

/**
 * Initialize the OneSatWallet for the current account
 */
export const initWallet = async (
  chromeStorageService: ChromeStorageService,
  startSync = false,
): Promise<OneSatWallet> => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  const owners = getOwners(chromeStorageService);
  const identityPubKey = account?.pubKeys?.identityPubKey || DEFAULT_PUBKEY;

  // Create storage
  const storageOptions = StorageProvider.createStorageBaseOptions(chain);
  const storageProvider = new StorageIdb(storageOptions);
  const storage = new WalletStorageManager(identityPubKey, storageProvider);

  // Initialize storage
  await storageProvider.migrate(`wallet-${selectedAccount || ''}`, identityPubKey);
  await storageProvider.makeAvailable();

  // Create sync queue with identityAddress as accountId
  const identityAddress = account?.addresses?.identityAddress || selectedAccount || '';
  const syncQueue = new IndexedDbSyncQueue(identityAddress);

  // Create read-only wallet (public key = read-only mode)
  const wallet = new OneSatWallet({
    rootKey: identityPubKey,
    storage,
    chain,
    owners,
    autoSync: false,
    syncQueue,
  });

  // Wrap broadcast to log raw tx before sending
  const originalBroadcast = wallet.broadcast.bind(wallet);
  wallet.broadcast = async (tx, description, labels) => {
    console.debug('Broadcasting tx:', tx.toHex());
    return originalBroadcast(tx, description, labels);
  };

  registerEventListeners(wallet);

  if (startSync && account) {
    wallet.sync();
  }

  return wallet;
};

/**
 * Initialize a signing-capable OneSatWallet with decrypted keys.
 * Use this for operations that require signing (createSignature, encrypt, decrypt, createAction).
 */
export const initSigningWallet = async (
  chromeStorageService: ChromeStorageService,
  keys: Keys,
): Promise<OneSatWallet> => {
  if (!keys?.identityWif) {
    throw new Error('Failed to retrieve keys');
  }

  const { selectedAccount } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  const identityKey = PrivateKey.fromWif(keys.identityWif);
  const identityPubKey = identityKey.toPublicKey().toString();

  // Create storage
  const storageOptions = StorageProvider.createStorageBaseOptions(chain);
  const storageProvider = new StorageIdb(storageOptions);
  const storage = new WalletStorageManager(identityPubKey, storageProvider);

  // Initialize storage
  await storageProvider.migrate(`wallet-${selectedAccount || ''}`, identityPubKey);
  await storageProvider.makeAvailable();

  // Create signing wallet with PrivateKey (not public key string)
  return new OneSatWallet({
    rootKey: identityKey,
    storage,
    chain,
  });
};

/**
 * Register event listeners to send sync status updates to the UI
 */
const registerEventListeners = (wallet: OneSatWallet) => {
  wallet.on('sync:start', (data) => {
    try {
      sendMessage({
        action: YoursEventName.SYNC_STATUS_UPDATE,
        data: { status: 'start', addressCount: data.addresses.length },
      });
    } catch (e) {
      // Ignore messaging errors
    }
  });

  wallet.on('sync:progress', (data) => {
    try {
      sendMessage({
        action: YoursEventName.SYNC_STATUS_UPDATE,
        data: {
          status: 'progress',
          pending: data.pending,
          done: data.done,
          failed: data.failed,
        },
      });
    } catch (e) {
      // Ignore messaging errors
    }
  });

  wallet.on('sync:complete', () => {
    try {
      sendMessage({
        action: YoursEventName.SYNC_STATUS_UPDATE,
        data: { status: 'complete' },
      });
    } catch (e) {
      // Ignore messaging errors
    }
  });

  wallet.on('sync:error', (data) => {
    try {
      sendMessage({
        action: YoursEventName.SYNC_STATUS_UPDATE,
        data: { status: 'error', message: data.message },
      });
    } catch (e) {
      // Ignore messaging errors
    }
    console.error('Sync error:', data.message);
  });
};
