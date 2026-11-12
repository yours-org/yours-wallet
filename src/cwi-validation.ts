import { validateWalletArgs, WERR_INVALID_PARAMETER } from '@bsv/sdk';
import { isCWIEventName } from '@1sat/wallet-browser';

/** BRC-100 basket namespaces permit ASCII letters, numbers and spaces only.
 * Match the SDK's identifier normalization without changing caller arguments.
 * Permission modules still decide ownership of reserved namespaces. */
function validateBasketNamespace(basket: unknown): void {
  if (typeof basket === 'string' && !/^[a-z0-9 ]+$/.test(basket.trim().toLowerCase())) {
    throw new WERR_INVALID_PARAMETER('basket', 'a name containing only lowercase letters, numbers and spaces');
  }
}

/** Validate the caller's raw request before permission modules, encryption,
 * option overrides or wallet initialization can obscure malformed values. */
export function validateCwiRequest(action: unknown, args: unknown): void {
  if (!isCWIEventName(action)) return;
  validateWalletArgs(action, args);
  const baskets = args as {
    basket?: unknown;
    outputs?: Array<{ basket?: unknown; insertionRemittance?: { basket?: unknown } }>;
  };
  if (action === 'listOutputs' || action === 'relinquishOutput') validateBasketNamespace(baskets.basket);
  if (action === 'createAction') {
    for (const output of baskets.outputs ?? []) validateBasketNamespace(output.basket);
  }
  if (action === 'internalizeAction') {
    for (const output of baskets.outputs ?? []) validateBasketNamespace(output.insertionRemittance?.basket);
  }
  const value = args as { protocolID?: [number, string]; certifierUrl?: unknown } | undefined;
  if (value?.protocolID !== undefined) {
    const protocol = value.protocolID[1];
    if (typeof protocol === 'string' && protocol !== protocol.toLowerCase()) {
      throw new WERR_INVALID_PARAMETER(
        'protocolID',
        'a protocol name containing only lowercase letters, numbers and spaces',
      );
    }
  }
  // The SDK validates this URL for issuance. Direct acquisition still must not
  // accept a malformed present string merely because that branch ignores it.
  if (action === 'acquireCertificate' && value?.certifierUrl !== undefined && typeof value.certifierUrl !== 'string') {
    throw new WERR_INVALID_PARAMETER('certifierUrl', 'a string when provided');
  }
}
