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
import { getHandle, probeSticks, requestHandlePermission } from './UsbKey.service';

export type UsbPresence = 'disabled' | 'present' | 'absent' | 'permission';

const FAILURES_TO_LOCK = 2;
let consecutiveFailures = 0;

export const resetUsbPresence = (): void => {
  consecutiveFailures = 0;
};

/**
 * One probe. Only `absent` (a read that failed under a live grant) counts
 * toward locking. `permission` means this page has no grant yet, which is the
 * normal state of every freshly opened window, and says nothing about whether
 * the drive is in: the page must ask Chrome (a click), not lock.
 */
export const checkUsbPresence = async (chromeStorageService: ChromeStorageService): Promise<UsbPresence> => {
  const usbSecurity = chromeStorageService.getUsbSecurity();
  if (!usbSecurity?.enabled) return 'disabled';
  const probe = await probeSticks(usbSecurity);
  if (probe.status === 'ok') {
    consecutiveFailures = 0;
    return 'present';
  }
  if (probe.status === 'permission') return 'permission';
  consecutiveFailures++;
  return 'absent';
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
  if (presence === 'absent' && consecutiveFailures >= FAILURES_TO_LOCK) {
    consecutiveFailures = 0;
    await onRemoved();
  }
  return presence;
};

/**
 * The check behind every Approve button in the prompt window. Runs inside the
 * click, which is the user gesture Chrome requires to grant drive access, so a
 * fresh window costs one browser bubble and no extra screen of ours. With the
 * feature off it returns ok immediately.
 */
export const confirmUsbForApproval = async (
  chromeStorageService: ChromeStorageService,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const usbSecurity = chromeStorageService.getUsbSecurity();
  if (!usbSecurity?.enabled) return { ok: true };
  let probe = await probeSticks(usbSecurity);
  if (probe.status === 'permission') {
    for (const id of probe.stickIds) {
      const handle = await getHandle(id);
      if (handle) await requestHandlePermission(handle);
    }
    probe = await probeSticks(usbSecurity);
  }
  if (probe.status === 'ok') {
    consecutiveFailures = 0;
    return { ok: true };
  }
  return { ok: false, message: USB_KEY_ABSENT_MESSAGE };
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

/** Shown wherever a spend or sign is refused because no registered drive reads. */
export const USB_KEY_ABSENT_MESSAGE = 'Insert your USB key to continue';

export class UsbKeyAbsentError extends Error {
  constructor(_presence: UsbPresence) {
    // While unlocked, Chrome reports an unplugged drive as "needs permission",
    // so both states mean the same thing to the user: the key is not there.
    super(USB_KEY_ABSENT_MESSAGE);
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
