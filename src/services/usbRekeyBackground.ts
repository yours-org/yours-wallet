/**
 * USB key security — the coordinated re-key, run only in the background
 * service worker. Pages request it via the `USB_REKEY` message after they have
 * verified the stick and the password themselves.
 *
 * Sequence (docs/usb-key-security.md, "Re-key routine"):
 *   1. mutex                        6. set session passKey (onChanged fans out)
 *   2. write keyRekey marker        7. read back: every account on the new epoch
 *   3. rekeyAccounts (pure)            and decryptable; repair any straggler from
 *   4. wrap the old passKey             keyRecovery; then delete keyRecovery
 *   5. one atomic set
 */
import { decrypt, encrypt } from '../utils/crypto';
import type { ChromeStorageService } from './ChromeStorage.service';
import type { Account, ChromeStorageObject, UsbSecurity } from './types/chromeStorage.types';
import { allAccountsDecrypt, findStaleAccounts, rekeyAccounts } from './usbRekey';

export interface UsbRekeyRequest {
  /** The passKey every account should end up under. */
  newPassKey: string;
  /** New settings, or null to turn USB security off. */
  usbSecurity: UsbSecurity | null;
}

export interface UsbRekeyResponse {
  success: boolean;
  error?: string;
  epoch?: number;
  accounts?: number;
}

let inFlight: Promise<UsbRekeyResponse> | null = null;

const rawGet = <K extends keyof ChromeStorageObject>(keys: K[]): Promise<Pick<ChromeStorageObject, K>> =>
  new Promise((resolve, reject) =>
    chrome.storage.local.get(keys, (r) =>
      chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r as Pick<ChromeStorageObject, K>),
    ),
  );

const rawRemove = (keys: string[]): Promise<void> =>
  new Promise((resolve, reject) =>
    chrome.storage.local.remove(keys, () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve())),
  );

const run = async (storage: ChromeStorageService, req: UsbRekeyRequest): Promise<UsbRekeyResponse> => {
  const oldPassKey = await storage.getPassKey();
  if (!oldPassKey) return { success: false, error: 'Wallet is locked' };
  if (!/^[0-9a-f]{64}$/.test(req.newPassKey)) return { success: false, error: 'Invalid new key' };

  const current = await rawGet(['accounts', 'keyEpoch', 'keyRekey', 'keyRecovery']);
  const accounts = current.accounts ?? {};
  if (current.keyRekey) return { success: false, error: 'A re-key is already in progress' };
  if (current.keyRecovery) {
    // A previous re-key never finished its read-back. Finish it before starting another.
    await repairStaleAccounts(storage);
  }

  const fromEpoch = current.keyEpoch ?? 0;
  const toEpoch = fromEpoch + 1;

  // 2. Marker first: from here every other account writer refuses.
  await storage.replaceTopLevel({ keyRekey: { fromEpoch, toEpoch, startedAt: new Date().toISOString() } });

  try {
    // 3. Pure re-key. Throws (writing nothing) if any account fails.
    const fresh = (await rawGet(['accounts'])).accounts ?? accounts;
    const { accounts: rekeyed, count } = await rekeyAccounts(fresh, oldPassKey, req.newPassKey, toEpoch);

    // 4. Old key, kept only until read-back proves nothing needs it.
    const wrappedPreviousPassKey = await encrypt(oldPassKey, req.newPassKey);

    // 5. One write. `accounts` is the complete, verified object: no merge.
    await storage.replaceTopLevel({
      accounts: rekeyed,
      keyEpoch: toEpoch,
      keyRecovery: { toEpoch, wrappedPreviousPassKey },
      ...(req.usbSecurity ? { usbSecurity: req.usbSecurity } : {}),
    });
    await rawRemove(['keyRekey', ...(req.usbSecurity ? [] : ['usbSecurity'])]);

    // 6. Session. Every context's cache follows via storage.onChanged.
    await storage.setPassKey(req.newPassKey);

    // 7. Read back.
    await repairStaleAccounts(storage);
    await storage.getAndSetStorage();
    return { success: true, epoch: toEpoch, accounts: count };
  } catch (err) {
    // Nothing after the marker was committed unless step 5 completed, in
    // which case keyRecovery exists and the next unlock finishes the job.
    await rawRemove(['keyRekey']).catch(() => {});
    await storage.getAndSetStorage();
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** Serialised entry point for the USB_REKEY message. */
export const usbRekey = (storage: ChromeStorageService, req: UsbRekeyRequest): Promise<UsbRekeyResponse> => {
  if (inFlight) return Promise.resolve({ success: false, error: 'A re-key is already in progress' });
  inFlight = run(storage, req).finally(() => {
    inFlight = null;
  });
  return inFlight;
};

/**
 * If a re-key committed but a stale writer reverted an account (or the
 * read-back never ran), bring every account onto the current epoch using the
 * wrapped previous key, then drop it. Safe to call on every unlock: it is a
 * no-op when there is nothing to repair. Requires the session passKey.
 */
export const repairStaleAccounts = async (storage: ChromeStorageService): Promise<void> => {
  const passKey = await storage.getPassKey();
  if (!passKey) return;
  const state = await rawGet(['accounts', 'keyEpoch', 'keyRekey', 'keyRecovery']);
  const accounts = state.accounts ?? {};
  const epoch = state.keyEpoch ?? 0;

  if (state.keyRekey && !state.keyRecovery) {
    // Crashed before the commit: nothing was rewritten. Clear the marker.
    await rawRemove(['keyRekey']);
  }
  if (!state.keyRecovery) return;

  const stale = findStaleAccounts(accounts, epoch);
  if (stale.length > 0) {
    let previousPassKey: string;
    try {
      previousPassKey = await decrypt(state.keyRecovery.wrappedPreviousPassKey, passKey);
    } catch {
      console.error('[usbRekey] keyRecovery is unreadable under the current passKey; leaving it for a later unlock');
      return;
    }
    const subset: Record<string, Account> = {};
    for (const id of stale) subset[id] = accounts[id];
    const { accounts: repaired } = await rekeyAccounts(subset, previousPassKey, passKey, epoch);
    await storage.replaceTopLevel({ accounts: { ...accounts, ...repaired } });
    console.log(`[usbRekey] repaired ${stale.length} account(s) onto epoch ${epoch}`);
  }

  const after = (await rawGet(['accounts'])).accounts ?? {};
  if (findStaleAccounts(after, epoch).length === 0 && (await allAccountsDecrypt(after, passKey))) {
    await rawRemove(['keyRecovery']);
  }
};
