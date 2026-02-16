/**
 * Network/Chain type conversion utilities.
 *
 * wallet-toolbox uses Chain ('main' | 'test')
 * yours-wallet-provider uses NetWork enum ('mainnet' | 'testnet')
 *
 * Chrome storage keeps the legacy 'mainnet'/'testnet' format for backwards
 * compatibility with existing user data. These helpers convert at the boundary.
 */

import type { sdk } from '@bsv/wallet-toolbox-mobile';

/**
 * Network values stored in chrome storage (legacy format).
 * Keep this for backwards compatibility with existing user data.
 */
export type StoredNetwork = 'mainnet' | 'testnet';

/**
 * Convert Chain to StoredNetwork for writing to chrome storage.
 *
 * @example
 * ```typescript
 * const chain: sdk.Chain = 'main';
 * account.network = chainToStoredNetwork(chain); // 'mainnet'
 * ```
 */
export function chainToStoredNetwork(chain: sdk.Chain): StoredNetwork {
  return chain === 'main' ? 'mainnet' : 'testnet';
}

/**
 * Convert StoredNetwork to Chain for use in code.
 *
 * @example
 * ```typescript
 * const stored = account.network; // 'mainnet'
 * const chain = storedNetworkToChain(stored); // 'main'
 * ```
 */
export function storedNetworkToChain(network: StoredNetwork | undefined): sdk.Chain {
  return network === 'testnet' ? 'test' : 'main';
}

/**
 * Type guard to check if a value is a valid StoredNetwork.
 */
export function isStoredNetwork(value: unknown): value is StoredNetwork {
  return value === 'mainnet' || value === 'testnet';
}

/**
 * Type guard to check if a value is a valid Chain.
 */
export function isChain(value: unknown): value is sdk.Chain {
  return value === 'main' || value === 'test';
}
