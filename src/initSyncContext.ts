/**
 * initSyncContext - Initialize sync components for yours-wallet.
 *
 * Both the UI (popup) and service worker can use this to create
 * their own instances of the sync infrastructure. They share the
 * same underlying IndexedDB database.
 */

import { PublicKey, Utils, type WalletInterface } from '@bsv/sdk';
import {
  AddressSyncQueueIdb,
  OneSatServices,
  AddressManager,
  YOURS_PREFIX,
  BRC29_PROTOCOL_ID,
  type AddressDerivation,
} from '@1sat/wallet-browser';

// Admin originator for the extension
const ADMIN_ORIGINATOR = `chrome-extension://${chrome.runtime.id}`;

// Base64-encoded prefix (computed once)
const BASE64_PREFIX = Utils.toBase64([...new TextEncoder().encode(YOURS_PREFIX)]);

export interface SyncContextOptions {
  /** Wallet interface (WalletPermissionsManager in service worker, ChromeCWI in UI) */
  wallet: WalletInterface;
  /** Chain: 'main' or 'test' */
  chain: 'main' | 'test';
  /** Account ID for IndexedDB namespace */
  accountId: string;
  /** Maximum key index for address derivation (0-based, so 4 = 5 addresses) */
  maxKeyIndex: number;
}

export interface SyncContext {
  /** 1Sat services for SSE and transaction fetching */
  services: OneSatServices;
  /** Sync queue (IndexedDB-backed) */
  syncQueue: AddressSyncQueueIdb;
  /** Address manager for looking up addresses */
  addressManager: AddressManager;
}

/**
 * Derive yours receive addresses using the wallet interface.
 * Uses BRC-29 protocol with the admin originator for permission checks.
 */
async function deriveAddresses(
  wallet: WalletInterface,
  maxKeyIndex: number,
): Promise<{ identityPubKey: string; derivations: AddressDerivation[] }> {
  // Get identity public key first
  const identityResult = await wallet.getPublicKey({ identityKey: true }, ADMIN_ORIGINATOR);
  const identityPubKey = identityResult.publicKey;

  const derivations: AddressDerivation[] = [];

  for (let i = 0; i <= maxKeyIndex; i++) {
    // Encode index as a single byte for suffix
    const base64Suffix = Utils.toBase64([i]);
    // keyID uses base64-encoded prefix and suffix joined with space
    const keyID = `${BASE64_PREFIX} ${base64Suffix}`;

    // Use BRC-29 protocol with forSelf=true (self-referential derivation)
    const result = await wallet.getPublicKey(
      {
        protocolID: BRC29_PROTOCOL_ID,
        keyID,
        forSelf: true,
      },
      ADMIN_ORIGINATOR,
    );

    const publicKey = PublicKey.fromString(result.publicKey);
    const address = publicKey.toAddress();

    derivations.push({
      address,
      index: i,
      derivationPrefix: BASE64_PREFIX,
      derivationSuffix: base64Suffix,
      senderIdentityKey: identityPubKey,
      publicKey: result.publicKey,
    });
  }

  return { identityPubKey, derivations };
}

/**
 * Initialize the sync context.
 *
 * Derives addresses using the wallet interface (with admin originator),
 * then creates OneSatServices, IndexedDbSyncQueue, and AddressManager.
 *
 * Both UI and service worker can call this independently - they
 * share the same IndexedDB database.
 */
export async function initSyncContext(options: SyncContextOptions): Promise<SyncContext> {
  const { wallet, chain, accountId, maxKeyIndex } = options;

  // Derive addresses with admin originator for permission checks
  const { derivations } = await deriveAddresses(wallet, maxKeyIndex);

  // Create AddressManager with pre-derived addresses
  const addressManager = new AddressManager(derivations);

  // Create services (1Sat ecosystem)
  const services = new OneSatServices(chain);

  // Create sync queue (IndexedDB)
  const syncQueue = new AddressSyncQueueIdb(accountId);

  return {
    services,
    syncQueue,
    addressManager,
  };
}
