/**
 * CWI (Chrome Wallet Interface) - BRC-100 WalletInterface implementation
 * Re-exports from @1sat/wallet-browser for browser page context
 */

import type { WalletInterface } from '@bsv/sdk';
import { createEventCWI, CWIEventName } from '@1sat/wallet-browser';

// Re-export for backwards compatibility
export { CWIEventName };

// Create the CWI instance for browser pages (uses CustomEvent pattern)
export const CWI = createEventCWI();

// Inject CWI on window
if (typeof window !== 'undefined') {
  (window as unknown as { CWI: WalletInterface }).CWI = CWI;
}
