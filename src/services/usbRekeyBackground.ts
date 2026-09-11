/**
 * USB key security — the coordinated re-key, run only in the background
 * service worker. Pages request it via the `USB_REKEY` message. The request
 * carries the password-derived key and the master factor(s), never a
 * finished passKey: the background derives both the current and the new key
 * itself and refuses unless the current one matches the session. A page can
 * therefore only re-key to a key that follows from the password it knows and
 * settings that verify against the master it holds.
 *
 * Sequence (docs/usb-key-security.md, "Re-key routine"):
 *   1. mutex                        6. set session passKey (onChanged fans out)
 *   2. write keyRekey marker        7. read back: every account on the new epoch
 *   3. rekeyAccounts (pure)            and decryptable; repair any straggler from
 *   4. wrap the old passKey             keyRecovery; then delete keyRecovery
 *   5. one atomic set
 */
import { decrypt, encrypt } from '../utils/crypto';
import { combinePassKey, verifyMasterCheck } from '../utils/usbCrypto';
import type { ChromeStorageService } from './ChromeStorage.service';
import type { Account, ChromeStorageObject, UsbSecurity } from './types/chromeStorage.types';
import { allAccountsDecrypt, findStaleAccounts, rekeyAccounts, validateUsbSecurity } from './usbRekey';

export interface UsbRekeyRequest {
  /** PBKDF2(password, salt), hex. Proves the password: combined with the current master it must equal the session key. */
  passwordKey: string;
  /** The current master factor, hex. Required while USB security is on. */
  master?: string;
  /** The master the new settings are for (rotate, enrol). Defaults to `master`. */
  newMaster?: string;
  /** New settings, or null to turn USB security off. */
  usbSecurity: UsbSecurity | null;
}

export interface UsbRekeyResponse {
  success: boolean;
  error?: string;
  epoch?: number;
  accounts?: number;
  /** The wallet locked while the re-key ran; storage is re-keyed but the session was left cleared. */
  relocked?: boolean;
}

export interface UsbRekeyOptions {
  /** Read on every call; a change means the wallet locked (or re-locked) since. */
  lockGeneration: () => number;
}

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Derive the key the wallet is under now and the key it should end up
 * under, from the caller's material, and check both against what storage
 * says. Nothing is written unless both check out.
 */
const deriveKeys = async (
  storage: ChromeStorageService,
  req: UsbRekeyRequest,
  sessionPassKey: string,
): Promise<{ newPassKey: string } | { error: string }> => {
  if (!HEX_64.test(req.passwordKey)) return { error: 'Invalid password key' };
  if (req.master !== undefined && !HEX_64.test(req.master)) return { error: 'Invalid key material' };
  if (req.newMaster !== undefined && !HEX_64.test(req.newMaster)) return { error: 'Invalid key material' };

  await storage.getAndSetStorage();
  const current = storage.getUsbSecurity();
  let expectedCurrent: string;
  if (current?.enabled) {
    if (!req.master) return { error: 'The current USB key is required' };
    if (!(await verifyMasterCheck(req.master, current.masterCheck))) return { error: 'USB key does not match' };
    expectedCurrent = await combinePassKey(req.passwordKey, req.master);
  } else {
    expectedCurrent = req.passwordKey;
  }
  if (expectedCurrent !== sessionPassKey) return { error: 'Incorrect password' };

  if (req.usbSecurity === null) return { newPassKey: req.passwordKey };
  const invalid = validateUsbSecurity(req.usbSecurity);
  if (invalid) return { error: invalid };
  const newMaster = req.newMaster ?? req.master;
  if (!newMaster) return { error: 'Key material for the new settings is required' };
  if (!(await verifyMasterCheck(newMaster, req.usbSecurity.masterCheck))) {
    return { error: 'New USB settings do not match their key' };
  }
  return { newPassKey: await combinePassKey(req.passwordKey, newMaster) };
};

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

const run = async (
  storage: ChromeStorageService,
  req: UsbRekeyRequest,
  options: UsbRekeyOptions,
): Promise<UsbRekeyResponse> => {
  const startedUnder = options.lockGeneration();
  const oldPassKey = await storage.getPassKey();
  if (!oldPassKey) return { success: false, error: 'Wallet is locked' };
  const derived = await deriveKeys(storage, req, oldPassKey);
  if ('error' in derived) return { success: false, error: derived.error };
  const { newPassKey } = derived;

  // Finish anything a previous re-key left behind (a committed write whose
  // read-back never ran, or a stale marker) before starting another.
  await repairStaleAccounts(storage);
  const current = await rawGet(['accounts', 'keyEpoch', 'keyRekey', 'keyRecovery']);
  const accounts = current.accounts ?? {};
  if (current.keyRekey) return { success: false, error: 'A re-key is already in progress' };

  const fromEpoch = current.keyEpoch ?? 0;
  const toEpoch = fromEpoch + 1;

  // 2. Marker first: from here every other account writer refuses.
  await storage.replaceTopLevel({ keyRekey: { fromEpoch, toEpoch, startedAt: new Date().toISOString() } });

  try {
    // 3. Pure re-key. Throws (writing nothing) if any account fails.
    const fresh = (await rawGet(['accounts'])).accounts ?? accounts;
    const { accounts: rekeyed, count } = await rekeyAccounts(fresh, oldPassKey, newPassKey, toEpoch);

    // 4. Old key, kept only until read-back proves nothing needs it.
    const wrappedPreviousPassKey = await encrypt(oldPassKey, newPassKey);

    // 5. One write. `accounts` is the complete, verified object: no merge.
    // Removals ride in the same set as nulls, so a worker killed right after
    // this line still leaves storage self-consistent: new blobs, new epoch,
    // new (or no) USB settings, and no in-progress marker. Readers treat
    // null as absent. The remove below is only tidying.
    await storage.replaceTopLevel({
      accounts: rekeyed,
      keyEpoch: toEpoch,
      keyRecovery: { toEpoch, wrappedPreviousPassKey },
      usbSecurity: req.usbSecurity ?? null,
      keyRekey: null,
    });
    await rawRemove(['keyRekey', ...(req.usbSecurity ? [] : ['usbSecurity'])]).catch(() => {});

    // 6. Session. Every context's cache follows via storage.onChanged. Not
    // if the wallet locked meanwhile: storage is re-keyed either way, but a
    // locked wallet must stay locked; the next unlock derives the new key.
    const relocked = options.lockGeneration() !== startedUnder || (await storage.getPassKey()) !== oldPassKey;
    if (!relocked) {
      await storage.setPassKey(newPassKey);
      // 7. Read back.
      await repairStaleAccounts(storage);
    }
    await storage.getAndSetStorage();
    return { success: true, epoch: toEpoch, accounts: count, relocked };
  } catch (err) {
    // Nothing after the marker was committed unless step 5 completed, in
    // which case keyRecovery exists and the next unlock finishes the job.
    await rawRemove(['keyRekey']).catch(() => {});
    await storage.getAndSetStorage();
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** Serialised entry point for the USB_REKEY message. */
export const usbRekey = (
  storage: ChromeStorageService,
  req: UsbRekeyRequest,
  options: UsbRekeyOptions,
): Promise<UsbRekeyResponse> => {
  if (inFlight) return Promise.resolve({ success: false, error: 'A re-key is already in progress' });
  inFlight = run(storage, req, options).finally(() => {
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
  } else if (state.keyRekey && state.keyRecovery && state.keyRekey.toEpoch === epoch) {
    // The commit landed (epoch advanced) but the marker survived: clear it so
    // account writers and future re-keys are not blocked forever.
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
    await rawRemove(['keyRecovery', 'keyRekey']);
  }
};
