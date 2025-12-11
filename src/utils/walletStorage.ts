import { StorageIdb, StorageIdbOptions } from '@bsv/wallet-toolbox';

/**
 * Extension of StorageIdb that supports custom database naming for multi-account support.
 *
 * This allows each account in yours-wallet to have its own isolated IndexedDB database,
 * preventing data collision between accounts.
 */
export class AccountStorageIdb extends StorageIdb {
  constructor(options: StorageIdbOptions, accountId: string) {
    super(options);
    // Override the dbName to include account identifier
    this.dbName = `${accountId}-wallet-${this.chain}net`
  }
}
