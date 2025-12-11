import { Wallet, WalletStorageManager, StorageProvider } from '@bsv/wallet-toolbox';
import { PrivateKey, KeyDeriver } from '@bsv/sdk';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { AccountStorageIdb } from './utils/walletStorage';
import { TransactionParser } from './indexers/TransactionParser';
import { getOwners, getIndexers } from './initParser';
import { NetWork } from 'yours-wallet-provider';
import { WalletAPI } from './services/WalletServices.service';

export interface WalletWithParser {
  wallet: Wallet;
  parser: TransactionParser;
  walletStorage: WalletStorageManager;
}

/**
 * Initializes a wallet-toolbox Wallet instance for the currently selected account.
 *
 * This creates a wallet using an ephemeral key for read-only operations.
 * The wallet's KeyDeriver can be updated later for signing operations.
 *
 * @param chromeStorageService - Service for accessing Chrome storage
 * @returns Initialized Wallet, TransactionParser, and WalletStorageManager
 */
export const initWallet = async (chromeStorageService: ChromeStorageService): Promise<WalletWithParser> => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();

  if (!selectedAccount || !account) {
    throw new Error('No account selected');
  }

  const network = account.network;
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  // Use the account's actual identity public key as the identityKey
  // This ensures we access the same database partition as when signing
  const identityKey = account.pubKeys.identityPubKey;

  // Create ephemeral KeyDeriver for read-only operations
  const ephemeralPrivateKey = PrivateKey.fromRandom();
  const keyDeriver = new KeyDeriver(ephemeralPrivateKey);

  // Override the identityKey to match the account's actual identity
  (keyDeriver as any).identityKey = identityKey;

  // Create account-specific storage
  const options = StorageProvider.createStorageBaseOptions(chain);
  const storage = new AccountStorageIdb(options, selectedAccount);

  // Initialize the database
  await storage.migrate('wallet', identityKey);

  // Create wallet storage manager
  const walletStorage = new WalletStorageManager(identityKey, storage);
  await walletStorage.makeAvailable();

  // Create services
  const walletServices = new WalletAPI(network);

  // Create the wallet
  const wallet = new Wallet({
    chain,
    keyDeriver,
    storage: walletStorage,
    services: walletServices,
  });

  // Create parser
  const networkType = network === NetWork.Mainnet ? 'mainnet' : 'testnet';
  const owners = getOwners(chromeStorageService);
  const indexers = getIndexers(owners, networkType);

  const parser = new TransactionParser(
    indexers,
    owners,
    walletStorage,
    walletServices,
  );

  // TODO: Add any additional initialization tasks here
  // - Sync processes
  // - Monitor setup
  // - etc.

  return { wallet, parser, walletStorage };
};
