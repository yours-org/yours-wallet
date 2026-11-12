import { validateWalletArgs, WERR_INVALID_PARAMETER } from '@bsv/sdk';
import { isCWIEventName } from '@1sat/wallet-browser';

/** Validate the caller's raw request before permission modules, encryption,
 * option overrides or wallet initialization can obscure malformed values. */
export function validateCwiRequest(action: unknown, args: unknown): void {
  if (!isCWIEventName(action)) return;
  validateWalletArgs(action, args);
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
