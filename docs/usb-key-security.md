# USB key security

Status: design v2, revised after two security reviews (cryptography; browser platform and lockout). Implemented on branch `dan/OPL-4678-usb-key-security`; see "Implementation notes" at the end for where the code deviates from the text above.

## Goal

An optional second factor for unlocking Yours Wallet. The user registers one or more ordinary USB drives. When the feature is on, the wallet can only be unlocked with the password **and** a registered drive present. While unlocked, the wallet checks for the drive before opening signing prompts and before its own send flows.

Explicit non-goals:

- This is not a hardware wallet. Keys are still decrypted into the extension's memory while the wallet is unlocked.
- Nothing wallet-related is stored on the drive. The drive holds one small random secret and an id.
- No native binary, no drivers, nothing to install. Any drive the OS mounts as a folder works.

## Threat model

Protects against:

- A stolen, shared, or unattended machine that is **locked** and whose drive is not mounted at the time. Without a registered drive's secret the stored keys cannot be decrypted, regardless of password.
- An extension storage dump taken while the drive is absent.
- Weak or reused passwords. The drive contributes 256 bits the attacker does not have, so offline brute force of the password alone does not work.

Does not protect against:

- Malware on the host while the wallet is unlocked. Keys are in the service worker's memory exactly as today.
- A storage dump taken while the drive is inserted, or an attacker holding both a registered drive (or a copy of its file) and the password.
- Seed phrase theft. A seed restores anywhere with no drive.
- Malicious dApps. That is the job of the permission prompts and the isolated prompt window.
- A user who points the picker at a folder on the internal disk. The extension cannot tell a removable drive from any other folder. The feature then degrades to password-only against a disk-image attacker.

The secret on the drive is a plain file and can be copied. The drive is a possession factor guarded by the password, not a tamper-resistant one. Product copy must say "USB unlock" or "USB key," never "hardware wallet." With USB backup on (OPL-4685) the drive also carries the encrypted wallet storage; see that section for what a lost drive then means.

**The cryptographic guarantee is at unlock.** Presence checks while unlocked are policy, not cryptography: dApp calls with a cached permission grant never open a prompt, the service worker re-initialises from the session key after an idle restart, and the popup's own send flows do not pass through the prompt window. The design covers those paths with the same presence check, but a session-level attacker is not stopped by it.

## Current key model (what exists today)

- One password, one `salt` at the storage root, shared by all accounts.
- `passKey = PBKDF2(password, salt, 100k iterations, 256-bit)` in `src/utils/crypto.ts` (`deriveKey`). Held only in `chrome.storage.session`, and cached per context in `ChromeStorageService.cachedPassKey`.
- Every account's `encryptedKeys` blob is AES-256-GCM encrypted directly with `passKey` (`v2:` prefix). Legacy CryptoJS AES-CBC blobs are upgraded on unlock by `verifyPassword`.
- `deriveKey` is called from three places that each set or return the passKey directly: `verifyPassword` (ChromeStorage.service), the new-wallet branch of `getPassKeyAndSalt` (Keys.service), and `verifyPasswordAndDeriveKey` (WalletBackupService).
- Account objects (including `encryptedKeys`) are written as whole snapshots by `updateNested` from roughly 19 call sites across 11 files.
- There is no change-password path today. Nothing currently re-keys all accounts at once.
- `signOut` in `background.ts` deletes every IndexedDB database not prefixed `block`.
- Backups copy `accounts` verbatim and derive only the password key.

## Design

### Key material

| Item                          | Size                            | Where it lives                                                                                                                                                                                         |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stick secret `S_i` + stick id | 32 bytes + short id             | One JSON file on the drive, `.yours/usb-key.json` (hidden directory). Nothing else.                                                                                                                    |
| Master factor `M`             | 32 bytes                        | Never stored unwrapped and **never held in session**. Wrapped once per registered stick in extension storage. Unwrapped on demand from an inserted stick. Shown once to the user as the recovery code. |
| Wrapper per stick             | AES-256-GCM ciphertext with AAD | Extension storage, `usbSecurity.sticks[i].wrappedMaster`                                                                                                                                               |
| Master verifier               | 32 bytes                        | `usbSecurity.masterCheck = HKDF(M, info="yours-usb-check-v1")`, lets the recovery-code path distinguish a typo from a wrong password                                                                   |
| Directory handle per stick    | `FileSystemDirectoryHandle`     | A dedicated, named IndexedDB database, keyed by stick id, per browser profile. Excluded from the `signOut` wipe, or wiped together with `usbSecurity`.                                                 |
| Account key blobs             | as today                        | Extension storage, encrypted under the combined passKey, each tagged with `keyEpoch`                                                                                                                   |

### Derivation

The existing PBKDF2 step is untouched (changing it would break existing passwords). Its hasher is pinned explicitly to SHA-256 (crypto-js 4.2.0 already defaults to it; 4.1.x defaulted to SHA-1 and the range is `^4.1.1`). One step is added after it when USB security is enabled:

```
pbkdf      = PBKDF2-SHA256(password, salt)                      // existing deriveKey, raw 32 bytes
wrapKey_i  = HKDF-SHA256(ikm = S_i, salt = "yours-usb-wrap-v1", info = stickId)
M          = AES-GCM-decrypt(wrappedMaster_i, wrapKey_i, aad = stickId || version)
passKey    = HKDF-SHA256(ikm = pbkdf || M, salt = "yours-usb-passkey-v1", info = "")
```

With USB security disabled, `passKey = pbkdf` exactly as today.

All derivation goes through **one** function, `derivePassKey(password, { stickSecret? | recoveryCode? })`, which consults `usbSecurity`. No caller may call `deriveKey` directly. Unlock reads the stick before verifying the password, since verification is impossible without `M`.

The master factor goes into the derivation, not into an "is the drive present" check. A presence-only check would leave the protection entirely in extension code.

### Storage additions

Root-level, alongside `salt`:

```ts
usbSecurity?: {
  enabled: true;
  version: 1;
  kdfVersion: 1;         // lets a future KDF change ride the same re-key routine
  epoch: number;         // incremented on every re-key; accounts carry the epoch they were written under
  masterCheck: string;   // HKDF(M) verifier, hex
  rekeyInProgress?: { fromEpoch: number; toEpoch: number; startedAt: string };
  sticks: Array<{
    id: string;            // matches the id in the file on the drive
    label: string;         // user-given, e.g. "Blue Kingston"
    wrappedMaster: string; // AES-GCM blob of M under wrapKey_i, AAD = id + version
    addedAt: string;       // ISO
  }>;
}
```

Each account gains `keyEpoch: number` (absent = epoch 0 = password-only).

Session storage keeps `passKey` only, as today. `M` is not stored in session.

### Re-key routine (enrollment, disable, rotation)

Used whenever the passKey changes. The wallet has never re-keyed all accounts before, and other contexts write whole account snapshots, so this must be coordinated, not just batched.

1. **Runs only in the background service worker**, under an in-memory mutex. Pages request it by message and wait.
2. Write `usbSecurity.rekeyInProgress` first. Every other account writer (`updateNested` on `accounts`, account creation, the legacy upgrade in `verifyPassword`) refuses while it is set.
3. Compute the new passKey. Decrypt every account's `encryptedKeys` with the old passKey, re-encrypt with the new one (always v2), tag with the new `keyEpoch`.
4. Verify every new blob decrypts under the new passKey and parses as valid `Keys`.
5. Write all accounts, the new `usbSecurity` (epoch, sticks, masterCheck), and clear `rekeyInProgress`, in **one** `chrome.storage.local.set` of the full `accounts` object. Never `update()` (read-merge-write) and never per-account `updateNested`.
6. Replace `passKey` in session, then **broadcast `PASSKEY_ROTATED`** so every context drops its `cachedPassKey` and re-reads session.
7. Read back and verify every account's `keyEpoch` matches. If any account is behind (a stale write from step 2 slipped through), re-key that account alone and re-verify.

Rotation additionally keeps the old `M` wrapped under the **new** passKey as `previousMaster` until step 7 passes, then deletes it. An account found under an old epoch at any later unlock is re-keyed from `previousMaster` if present; if not, that account is seed-restore only, and the UI says so.

### Presence check

A single `readStick()` helper: load saved handles, `queryPermission`, read `.yours/usb-key.json` with a size cap (4 KB) and strict JSON parse, match the id against `usbSecurity.sticks`, **unwrap `M` and verify `masterCheck`**. A file with the right id but wrong secret does not pass. Two consecutive failures over about four seconds count as absent; a single failure is ignored (macOS sleep and flaky readers).

## User journey

### Enable

1. Settings → Security → "Require USB key." Explainer states what it protects against, what it doesn't, and that losing all sticks and the recovery code means restoring from backup. Wallet must be unlocked.
2. **Gate: a fresh master backup**, not a seed checkbox. Accounts imported from a WIF have no seed. The toggle is disabled until a backup has been exported in this session.
3. "Choose USB drive" opens a **dedicated extension window** (`chrome.windows.create`, like the prompt window), not the browser-action popup. The OS folder dialog steals focus, and Chrome closes the action popup on blur, which aborts the picker. Copy tells the user the dialog will say "Yours Wallet wants to edit files" and never a website name. User picks the drive root. Extension creates `.yours/usb-key.json` with a fresh `S_1` and id, and stores the handle.
4. User labels the stick. Extension generates `M`, shows the recovery code (base32 with checksum, or BIP39 words), and **requires the user to type it back** before continuing. Then wraps `M` under `wrapKey_1`, computes `masterCheck`, and runs the re-key routine.

### Unlock, same machine

Unlock screen shows the password field and a status line ("USB key detected" / "Insert your USB key"). `readStick()` yields `M`; `derivePassKey` decrypts the selected account. Missing drive, wrong password, and unreadable file produce different messages.

### Unlock after browser restart

Saved handles report permission state `prompt`. The unlock screen shows an "Allow USB access" button that calls `requestPermission()` (Chrome bubble, needs a gesture, expected to work from the action popup; verify). If Chrome's persistent file-system permissions apply to extension origins, this step disappears after repeated use. **Open question, to verify in spike.**

### Re-pick from the locked screen

If every saved handle fails (volume renamed, handle wiped by sign-out, corrupted file), the unlock screen offers "Find my USB key," which opens the dedicated window's picker and matches the file's id against `usbSecurity.sticks`. This needs no session state.

### Signing and sending

The prompt window (`src/prompt-tab.tsx`) calls `readStick()` before rendering any request. The popup's own send, inscribe, and transfer flows call it before building a transaction. On absence, the UI shows "Insert your USB key to continue," retries every ~2 s, and proceeds once present. dApp calls that are covered by a cached permission grant do not open a prompt and are not gated; the threat model says so.

### Drive removed mid-session

Any page that sees two consecutive `readStick()` failures clears `passKey` from session, which is the same as locking. The background service worker cannot watch the drive on its own. **Open question: whether the service worker can use a saved handle to read at all.** If it can, the background polls on a timer and locks itself.

### Add a stick

Settings → USB keys → "Add another." Requires the current stick to be inserted (that is where `M` comes from). Dedicated window picker, label, done. New `S_2` and id written to the new drive, `M` wrapped under `wrapKey_2`, entry appended. Accounts untouched.

### Remove a stick

Deletes that stick's wrapper entry and handle. Removing the last stick is blocked. Erasing the file from the drive is **opt-in with a warning**: another install sharing that stick would be locked out.

### Rotate ("Lost this stick?" or "I think a stick was copied")

Generates a new `M`, runs the re-key routine, rewraps the new `M` under every remaining stick's secret, shows a new recovery code (typed back). Copy is explicit: rotation protects **future** storage from a copied stick. An attacker who already holds a copy of the stick file **and** a storage dump from before rotation can still decrypt that dump with the password. If both are suspected, sweep to a new seed.

### Lost every stick

Unlock screen → "Lost your USB key?" → recovery code + password. `derivePassKey` takes the code as `M`, checks `masterCheck` first (typo vs wrong password), decrypts. On success the user is walked into **rotation**, not reuse: new `M`, new code, new stick. The lost sticks' secrets no longer unwrap anything current.

### Lost sticks and no recovery code

Restore from the master backup. USB security is off after any restore.

### Backup and restore

- Export while enabled: the archive's account blobs are re-encrypted under `pbkdf` (password-only). Export must decrypt with the combined key and **fail closed** if the stick is absent. The UI warns: "This backup is protected by your password only." The archive never contains `usbSecurity`, `M`, or stick secrets. Blobs are verified to decrypt before the zip is written.
- Restore: refuses to restore over a wallet that has `usbSecurity` enabled (disable first). Always removes `usbSecurity` and the handle database. Lands with the feature off.
- Re-enabling with an already-enrolled stick detects the existing file, keeps its `S_i` and id, and wraps a fresh `M` under it.

A USB-bound archive (blobs kept under the combined key, restore requires the recovery code) was considered and rejected: a backup that can fail to restore is worse than one at today's protection level.

### Disable

Toggle off, password confirm, stick present. Re-key routine back to `passKey = pbkdf`, delete `usbSecurity` and the handle database. Optional erase of the drive file, with the multi-install warning.

## Platform notes

- File System Access API is Chrome and Edge only. Feature is hidden on browsers without `showDirectoryPicker`.
- `showDirectoryPicker` needs a user gesture in a visible extension page **that survives focus loss**: a dedicated window or tab, not the action popup. `requestPermission` is a Chrome bubble and should work from the popup; verify.
- Handles are keyed by path (mount point), not by physical device. The id inside the file is what binds a handle to a registered stick.
- A web page can run its own picker styled to look like Yours and, if the user picks the drive, copy the file. `S_i` alone is useless without a storage dump and the password, so impact is bounded. Enrollment copy addresses it.
- `decrypt` falls through to the unauthenticated legacy CBC path for blobs without `v2:`. When `usbSecurity.enabled`, that path is disabled: every blob was rewritten as v2 by the re-key.
- No manifest change is needed for the File System Access API.

## Open questions for the spike

1. Does Chrome's persistent File System Access permission cover extension origins? Decides whether restart costs a click or nothing.
2. Can the MV3 service worker read through a `FileSystemDirectoryHandle` loaded from IndexedDB? Decides whether background auto-lock on removal is possible.
3. Behaviour of `queryPermission`/`requestPermission`/`getFile` on a handle whose volume is not mounted: prompt rejection or hang. Affects the poll.
4. Does Chrome allow picking a removable drive's root, or are some roots blocklisted? If blocklisted, the user picks a folder they create on the drive.
5. Does `requestPermission` from the action popup survive, or does the bubble also blur the popup?

## Review history

- v1 reviewed 2026-09-10 by a cryptography reviewer (verdict: changes required) and a platform/lockout reviewer (verdict: sign off with changes). v2 incorporates every blocking finding: rotation wording, coordinated re-key with epochs and a stale-cache broadcast, single derivation function, restore clears `usbSecurity`, backup export fails closed and warns, recovery forces rotation, `M` not held in session, enrollment moved out of the action popup, locked-screen re-pick, backup-not-seed gate with typed-back recovery code, presence check unwraps `M`, hidden directory with size cap, opt-in erase with multi-install warning, SHA-256 pinned, `kdfVersion`, legacy decrypt disabled when enabled.

## Implementation notes

Where the code differs from the design text above, the code is authoritative.

- **Epoch lives at the storage root.** `keyEpoch`, `keyRekey` (the in-progress marker) and `keyRecovery` (the previous passKey wrapped under the current one) are root keys, not fields of `usbSecurity`, so they survive disabling the feature and a disable that is interrupted can still be repaired.
- **`M` is never in session.** Pages that need it (settings confirmations, key export, account creation) probe the inserted stick inside `ChromeStorageService.verifyPassword` when no material is passed. The unlock screen passes material explicitly so it can tell "wrong password" from "no stick".
- **The passKey cache is module-level** in `ChromeStorage.service.ts` and follows `chrome.storage.session` changes, which is how every context learns about a re-key. There is no separate broadcast message.
- **Rotation keeps one stick.** Wrapping a new master under a stick needs that stick's secret, which only exists on the stick, so a rotation registers only the drive picked during the flow and drops the rest. Other sticks are re-added from Settings afterwards. The lost-every-stick recovery goes straight into this rotation.
- **Backups always carry password-only blobs.** `MASTER_BACKUP` now carries the password the user just confirmed; the background re-encrypts each account under the password key for the archive. Restore refuses while the feature is on and strips any USB state from the archive.
- **Recovery code must be typed back** during enrolment and rotation, and enrolment requires a master backup exported in the current session (`usbBackupConfirmedAt` in session storage).
- **Presence policy** (`src/services/usbPresence.ts`): the popup's wallet is wrapped so spend/sign/reveal calls probe first; the popup checks on open and every 5 s while open (`UsbGate`); the prompt window probes before rendering a request; two consecutive misses lock. Read-only calls from the popup are not gated.
- **No background watcher, by finding not by choice.** An offscreen keeper page (`chrome.offscreen`) was built, removed, restored, and finally removed on 2026-09-10. Chrome ties one-time File System Access grants to real windows and tabs; an offscreen document does not keep them alive, and without a grant it cannot read the drive, so it could neither hold the grant across popup closes nor detect removal. Consequences: the popup shows "Allow USB access" once per open (`UsbGate`), removal is noticed by whichever wallet window next checks, and dApp read calls keep working while no window is open. Offscreen documents also have no `chrome.storage`; only messaging. The only remaining route to a seamless flow is Chrome's persistent file permissions ("Allow on every visit" in the access bubble), which is Chrome's decision, not the extension's.
- **Chrome reports an unplugged drive as "needs permission."** `queryPermission` on a handle whose volume is not mounted returns `prompt`, not an error. While unlocked, every unlocked-path check therefore treats `permission` the same as `absent`. Only the unlock screen and the popup gate distinguish them, and there the answer is one click: Chrome cannot grant access to a drive that is not there, so a request that still comes back `prompt` means "not plugged in."
- **Sign-out** already clears all local storage and every IndexedDB database, which covers the handle store, so nothing extra is needed there.

## USB backup sync (OPL-4685)

Why it matters more here than in a BIP32 wallet: BRC-100 outputs are spendable only with the derivation metadata held in wallet storage, which cannot be rebuilt from the seed. Local IndexedDB and the remote are two copies; a registered USB key is a third that depends on no provider and no browser profile.

**What runs where.** The popup owns the loop (`src/services/usbBackup.ts`): it is the only context with a drive grant and a session. The background owns the data (`src/services/usbBackupBackground.ts`): all accounts share one IndexedDB database, so a single extra read-only `StorageIdb` serves toolbox sync chunks for every account, with no account switching and without closing the live wallet. `USB_BACKUP_CHUNK` and `USB_BACKUP_SETTINGS` are refused while locked; the reader is closed whenever the wallet context is dropped.

**Loop.** Whenever the unlocked popup is open and a key reads: for each present key, write `restore.json` (salt + wrappers, plaintext, no secrets), `keys.enc`, `settings.enc` once, then for each account request chunks from the cursor in the on-drive manifest until the toolbox returns no rows newer than `since`. Each chunk file and the manifest are written atomically (File System Access swaps on close), so a pull mid-write is harmless and the manifest is the cursor of record on resume. The cursor for a pass is the pass's start time, so rows written during a pass are picked up next time; restore merges by id so duplicates are harmless. After 40 increments an account's chunks are rebuilt from a full pass. Triggers: popup open, background `SYNC_STATUS_UPDATE: complete` (debounced), and a 60 s timer. Only `usbBackupStatus` (identityAddress → last backup time and which keys hold it) is written to extension storage.

**Encryption, and what a lost drive means.** Everything except `restore.json` is AES-GCM under a key derived from the combined passKey with an extra 600k rounds of native PBKDF2 (`deriveBackupKey`). Restore rebuilds that key from the drive's own key file plus the password: stick secret → unwrap master (wrappers in `restore.json`) → combined passKey → backup key. **This changes the threat model for the drive.** Before backup, the drive held only a secret that was useless without the wallet's storage. With backup on, the drive holds the secret _and_ the encrypted storage, so a lost drive is an offline password-guessing target, exactly like an exported master backup file. The password is the remaining factor; the slow derivation raises the cost per guess but does not change the nature of the risk. The settings toggle says so ("Key + password restores it"). Users who want the drive to stay inert can turn backup off.

**Restore.** USB window mode `restore`, reachable from the start screen on a fresh install. `readUsbBackup` decrypts the manifest, keys, settings, and chunks, re-encrypts account blobs under the password-only key, and hands the existing `MASTER_RESTORE` handler exactly what a file restore sends. Lands with USB unlock off, like a file restore.

**UI.** A dismissable pill in the popup while syncing; green "up to date" that fades; nothing when a key is not readable. Per-key freshness on the USB Unlock page ("Backed up 3 days ago"), a "Back up now" row, a toggle to turn backup off, and an amber mark on the settings row when any key is overdue (7 days). Staleness is per key, not per account, because every pass covers all accounts.
