/**
 * USB key security — presence policy for unlocked pages.
 *
 * The cryptographic guarantee is at unlock. While unlocked this module is the
 * policy layer: before a signing prompt renders or the popup builds a
 * transaction, the page checks a registered stick still reads. Two
 * consecutive failures (a single one is ignored: sleep/wake and flaky readers)
 * count as removed, and the page locks the wallet.
 */
import type { ChromeStorageService } from './ChromeStorage.service';
import { probeSticks } from './UsbKey.service';

export type UsbPresence = 'disabled' | 'present' | 'absent' | 'permission';

const FAILURES_TO_LOCK = 2;
let consecutiveFailures = 0;

export const resetUsbPresence = (): void => {
  consecutiveFailures = 0;
};

/**
 * One probe. `absent` and `permission` both count as a failure for locking
 * purposes; the distinction lets UI copy say which button to show.
 */
export const checkUsbPresence = async (chromeStorageService: ChromeStorageService): Promise<UsbPresence> => {
  const usbSecurity = chromeStorageService.getUsbSecurity();
  if (!usbSecurity?.enabled) return 'disabled';
  const probe = await probeSticks(usbSecurity);
  if (probe.status === 'ok') {
    consecutiveFailures = 0;
    return 'present';
  }
  consecutiveFailures++;
  return probe.status === 'permission' ? 'permission' : 'absent';
};

/**
 * Probe, and if the stick has now been missing for two checks in a row, run
 * `onRemoved` (typically `lockWallet`). Returns the presence either way.
 */
export const enforceUsbPresence = async (
  chromeStorageService: ChromeStorageService,
  onRemoved: () => void | Promise<void>,
): Promise<UsbPresence> => {
  const presence = await checkUsbPresence(chromeStorageService);
  if (presence !== 'present' && presence !== 'disabled' && consecutiveFailures >= FAILURES_TO_LOCK) {
    consecutiveFailures = 0;
    await onRemoved();
  }
  return presence;
};

/** Wallet methods that spend, sign, or reveal. Everything else stays readable without the stick. */
export const USB_GATED_WALLET_METHODS = new Set([
  'createAction',
  'signAction',
  'internalizeAction',
  'createSignature',
  'createHmac',
  'encrypt',
  'decrypt',
  'revealCounterpartyKeyLinkage',
  'revealSpecificKeyLinkage',
  'acquireCertificate',
  'proveCertificate',
  'relinquishCertificate',
  'relinquishOutput',
]);

export class UsbKeyAbsentError extends Error {
  constructor(presence: UsbPresence) {
    super(presence === 'permission' ? 'Allow access to your USB key to continue' : 'Insert your USB key to continue');
    this.name = 'UsbKeyAbsentError';
  }
}

/**
 * Wrap the popup's wallet so gated calls first confirm a stick is present.
 * With USB security off the check returns immediately, so this costs nothing
 * for everyone else.
 */
export const gateWalletOnUsb = <T extends object>(
  wallet: T,
  chromeStorageService: ChromeStorageService,
  onRemoved: () => void | Promise<void>,
): T =>
  new Proxy(wallet, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || !USB_GATED_WALLET_METHODS.has(String(prop))) return value;
      return async (...args: unknown[]) => {
        const presence = await enforceUsbPresence(chromeStorageService, onRemoved);
        if (presence !== 'present' && presence !== 'disabled') throw new UsbKeyAbsentError(presence);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
