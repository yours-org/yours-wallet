import { Wallet, WalletStorageManager, StorageProvider } from '@bsv/wallet-toolbox';
import { PrivateKey, KeyDeriver } from '@bsv/sdk';
import { NetWork } from 'yours-wallet-provider';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { AccountStorageIdb } from './utils/walletStorage';
import { KeysService } from './services/Keys.service';
import { WalletAPI } from './services/WalletServices.service';

/**
 * Factory functions for creating wallet-toolbox Wallet instances.
 *
 * Wallets are created on-demand rather than at startup, allowing for:
 * - Read-only access without decrypting keys (using ephemeral KeyDeriver)
 * - Signing operations with real identity keys (when user unlocks)
 * - Future sync processes and background operations
 */

/**
 * Creates a wallet instance for read-only operations.
 * Uses an ephemeral private key since no signing will occur.
 *
 * @param chromeStorageService - Service for accessing Chrome storage
 * @returns Initialized Wallet instance suitable for queries
 */
export const getWalletForRead = async (chromeStorageService: ChromeStorageService): Promise<Wallet> => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();

  if (!selectedAccount || !account) {
    throw new Error('No account selected');
  }

  const network = account.network;
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  // Use the account's actual identity public key as the identityKey
  // This ensures we access the same database partition as the signing wallet
  const identityKey = account.pubKeys.identityPubKey;

  // Create a mock KeyDeriver with ephemeral private key
  // The keyDeriver won't be used for signing in read-only mode
  const ephemeralPrivateKey = PrivateKey.fromRandom();
  const keyDeriver = new KeyDeriver(ephemeralPrivateKey);

  // Override the identityKey to match the account's actual identity
  (keyDeriver as any).identityKey = identityKey;

  // Create account-specific storage
  const options = StorageProvider.createStorageBaseOptions(chain);
  const storage = new AccountStorageIdb(options, selectedAccount);

  // Initialize the database with the ephemeral identity
  await storage.migrate('wallet', identityKey);

  // Create wallet storage manager
  const walletStorage = new WalletStorageManager(identityKey, storage);
  await walletStorage.makeAvailable();

  // Create the wallet
  const wallet = new Wallet({
    chain,
    keyDeriver,
    storage: walletStorage,
  });

  return wallet;
};

/**
 * Creates a wallet instance for signing operations.
 * Uses the account's real identity private key, requiring password unlock.
 *
 * @param chromeStorageService - Service for accessing Chrome storage
 * @param keysService - Service for decrypting keys
 * @param password - User's password for key decryption
 * @returns Initialized Wallet instance with signing capabilities
 */
export const getWalletForSign = async (
  chromeStorageService: ChromeStorageService,
  keysService: KeysService,
  password: string
): Promise<Wallet> => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();

  if (!selectedAccount || !account) {
    throw new Error('No account selected');
  }

  const network = account.network;
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  // Decrypt the account's real identity key
  const keys = await keysService.retrieveKeys(password);
  if (!keys.identityWif) {
    throw new Error('Identity key not found in account');
  }

  const identityPrivateKey = PrivateKey.fromWif(keys.identityWif);
  const keyDeriver = new KeyDeriver(identityPrivateKey);
  const identityKey = keyDeriver.identityKey;

  // Create account-specific storage
  const options = StorageProvider.createStorageBaseOptions(chain);
  const storage = new AccountStorageIdb(options, selectedAccount);

  // Initialize the database with the real identity
  await storage.migrate('wallet', identityKey);

  // Create wallet storage manager
  const walletStorage = new WalletStorageManager(identityKey, storage);
  await walletStorage.makeAvailable();

  // Create services
  const services = new WalletAPI(network);

  // Create the wallet
  const wallet = new Wallet({
    chain,
    keyDeriver,
    storage: walletStorage,
    services,
  });

  return wallet;
};

/**
 * Destroys a wallet instance, cleaning up storage connections.
 * Should be called when switching accounts or closing the wallet.
 *
 * @param wallet - The wallet instance to destroy
 */
export const destroyWallet = async (wallet: Wallet): Promise<void> => {
  await wallet.destroy();
};
