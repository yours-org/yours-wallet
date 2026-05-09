/**
 * initSyncContext - Initialize sync components for yours-wallet.
 *
 * Both the UI (popup) and service worker can use this to create
 * their own instances of the sync infrastructure. They share the
 * same underlying IndexedDB database.
 */

import type { WalletInterface } from '@bsv/sdk';
import { OneSatServices, AddressManager, YOURS_PREFIX } from '@1sat/wallet-browser';
import { deriveDepositAddresses } from '@1sat/actions';

export interface SyncContextOptions {
  /** Underlying BRC-100 wallet (not the WPM wrapper). */
  wallet: WalletInterface;
  /** Chain: 'main' or 'test' */
  chain: 'main' | 'test';
  /** Maximum key index for address derivation (0-based, so 4 = 5 addresses) */
  maxKeyIndex: number;
}

export interface SyncContext {
  /** 1Sat services for SSE and transaction fetching */
  services: OneSatServices;
  /** Address manager for looking up addresses */
  addressManager: AddressManager;
}

/**
 * Initialize the sync context.
 *
 * Defers to `@1sat/actions` `deriveDepositAddresses` so the wallet's
 * receive address matches what dApps compute through the same SDK action.
 */
export async function initSyncContext(options: SyncContextOptions): Promise<SyncContext> {
  const { wallet, chain, maxKeyIndex } = options;
  const services = new OneSatServices(chain);

  const { derivations } = await deriveDepositAddresses.execute(
    { wallet, services, chain },
    { prefix: YOURS_PREFIX, startIndex: 0, count: maxKeyIndex + 1 },
  );

  return {
    services,
    addressManager: new AddressManager(derivations),
  };
}
