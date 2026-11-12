/**
 * CWI (Chrome Wallet Interface) - BRC-100 WalletInterface implementation
 * Re-exports from @1sat/wallet-remote for browser page context
 */

import type { WalletInterface } from '@bsv/sdk';
import { CWIEventName } from '@1sat/wallet-browser';
import { createStructuredEventCWI } from './cwi-transport';

// Re-export for backwards compatibility
export { CWIEventName };

// Create the CWI instance for browser pages (uses CustomEvent pattern)
export const CWI = createStructuredEventCWI();

// Inject CWI on window
if (typeof window !== 'undefined') {
  (window as unknown as { CWI: WalletInterface }).CWI = CWI;
}
