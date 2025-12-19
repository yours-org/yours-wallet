import { NetWork } from 'yours-wallet-provider';
import { OneSatWallet } from '@1sat/wallet-toolbox';
import { WalletStorageManager, StorageProvider } from '@bsv/wallet-toolbox/mobile';
import { StorageIdb } from '@bsv/wallet-toolbox/mobile/out/src/storage/StorageIdb';
import { PrivateKey } from '@bsv/sdk';
import { YoursEventName } from './inject';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { sendMessage } from './utils/chromeHelpers';

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

  // Create read-only wallet (public key = read-only mode)
  const wallet = new OneSatWallet({
    rootKey: identityPubKey,
    storage,
    chain,
    owners,
    autoSync: false,
  });

  registerEventListeners(wallet);

  if (startSync && account) {
    wallet.syncAll();
  }

  return wallet;
};

/**
 * Register event listeners to send sync status updates to the UI
 */
const registerEventListeners = (wallet: OneSatWallet) => {
  wallet.on('sync:start', (data: { address: string }) => {
    try {
      sendMessage({
        action: YoursEventName.IMPORT_STATUS_UPDATE,
        data: { tag: 'wallet', name: `Syncing ${data.address}` },
      });
    } catch (e) {
      // Ignore messaging errors
    }
  });

  wallet.on('sync:parsed', (data: { txid: string; internalizedCount: number }) => {
    if (data.internalizedCount > 0) {
      try {
        sendMessage({
          action: YoursEventName.FETCHING_TX_STATUS_UPDATE,
          data: { txid: data.txid },
        });
      } catch (e) {
        // Ignore messaging errors
      }
    }
  });

  wallet.on('sync:complete', (data: { address: string }) => {
    try {
      sendMessage({
        action: YoursEventName.IMPORT_STATUS_UPDATE,
        data: { tag: 'complete', name: `Completed ${data.address}` },
      });
    } catch (e) {
      // Ignore messaging errors
    }
  });

  wallet.on('sync:error', (data: { address: string; error: Error }) => {
    console.error(`Sync error for ${data.address}:`, data.error);
  });
};
