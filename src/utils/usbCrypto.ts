/**
 * USB key security — pure cryptography. No chrome.* or DOM APIs so this
 * module runs in the service worker, extension pages, and `bun test`.
 *
 * See docs/usb-key-security.md for the design. Summary:
 *
 *   pbkdf     = PBKDF2-SHA256(password, salt)               (existing deriveKey)
 *   wrapKey_i = HKDF(ikm = S_i, salt = WRAP_SALT, info = stickId)
 *   M         = AES-GCM-decrypt(wrappedMaster_i, wrapKey_i, aad = stickId|version)
 *   passKey   = HKDF(ikm = pbkdf || M, salt = PASSKEY_SALT)
 *
 * S_i lives only in a small file on the drive. M is never stored unwrapped.
 */
import { bytesToHex, hexToBytes } from './crypto';

export const USB_SECURITY_VERSION = 1;
export const USB_FILE_FORMAT = 'yours-usb-key';
export const USB_FILE_VERSION = 1;
export const USB_FILE_DIR = '.yours';
export const USB_FILE_NAME = 'usb-key.json';
/** Hard cap on the stick file. A hostile file on a borrowed drive must not stall unlock. */
export const USB_FILE_MAX_BYTES = 4096;

const WRAP_SALT = 'yours-usb-wrap-v1';
const PASSKEY_SALT = 'yours-usb-passkey-v1';
const CHECK_INFO = 'yours-usb-check-v1';
const WRAPPED_PREFIX = 'usb1:';

const enc = new TextEncoder();

/** Contents of `.yours/usb-key.json` on the drive. Nothing wallet-related. */
export interface UsbStickFile {
  format: typeof USB_FILE_FORMAT;
  version: typeof USB_FILE_VERSION;
  /** Short random id; matches `usbSecurity.sticks[i].id`. */
  id: string;
  /** 32 random bytes, hex. */
  secret: string;
}

export const randomHex = (bytes: number): string => bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));

export const newStickId = (): string => randomHex(8);
export const newStickSecret = (): string => randomHex(32);
export const newMaster = (): string => randomHex(32);

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

/** Strict parse of the stick file. Returns null for anything that is not exactly our shape. */
export const parseStickFile = (text: string): UsbStickFile | null => {
  if (text.length > USB_FILE_MAX_BYTES) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const { format, version, id, secret } = obj as Record<string, unknown>;
  if (format !== USB_FILE_FORMAT || version !== USB_FILE_VERSION) return null;
  if (typeof id !== 'string' || !HEX_16.test(id)) return null;
  if (typeof secret !== 'string' || !HEX_64.test(secret)) return null;
  return { format, version, id, secret };
};

export const serializeStickFile = (file: UsbStickFile): string => JSON.stringify(file, null, 2) + '\n';

const hkdf = async (ikm: Uint8Array, salt: string, info: string, bytes = 32): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', ikm.buffer as ArrayBuffer, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt).buffer as ArrayBuffer,
      info: enc.encode(info).buffer as ArrayBuffer,
    },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
};

const importAesKey = (raw: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);

const wrapAad = (stickId: string): ArrayBuffer =>
  enc.encode(`${stickId}|${USB_SECURITY_VERSION}`).buffer as ArrayBuffer;

/** Encrypt the master factor under a key derived from one stick's secret. */
export const wrapMaster = async (masterHex: string, stickSecretHex: string, stickId: string): Promise<string> => {
  const wrapKey = await importAesKey(await hkdf(hexToBytes(stickSecretHex), WRAP_SALT, stickId));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: wrapAad(stickId) },
    wrapKey,
    hexToBytes(masterHex).buffer as ArrayBuffer,
  );
  return WRAPPED_PREFIX + bytesToHex(iv) + bytesToHex(new Uint8Array(ct));
};

/** Inverse of wrapMaster. Throws on a wrong secret, wrong stick id, or tampered blob. */
export const unwrapMaster = async (wrapped: string, stickSecretHex: string, stickId: string): Promise<string> => {
  if (!wrapped.startsWith(WRAPPED_PREFIX)) throw new Error('Unrecognised wrapped master format');
  const payload = wrapped.slice(WRAPPED_PREFIX.length);
  const iv = hexToBytes(payload.slice(0, 24));
  const ct = hexToBytes(payload.slice(24));
  const wrapKey = await importAesKey(await hkdf(hexToBytes(stickSecretHex), WRAP_SALT, stickId));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: wrapAad(stickId) },
    wrapKey,
    ct.buffer as ArrayBuffer,
  );
  return bytesToHex(new Uint8Array(pt));
};

/** Verifier stored next to the wrappers so a recovery-code typo is distinguishable from a wrong password. */
export const computeMasterCheck = async (masterHex: string): Promise<string> =>
  bytesToHex(await hkdf(hexToBytes(masterHex), '', CHECK_INFO));

export const verifyMasterCheck = async (masterHex: string, masterCheck: string): Promise<boolean> =>
  (await computeMasterCheck(masterHex)) === masterCheck;

/** The combined passKey: password-derived key mixed with the master factor. */
export const combinePassKey = async (pbkdfHex: string, masterHex: string): Promise<string> => {
  const pbkdf = hexToBytes(pbkdfHex);
  const master = hexToBytes(masterHex);
  const ikm = new Uint8Array(pbkdf.length + master.length);
  ikm.set(pbkdf, 0);
  ikm.set(master, pbkdf.length);
  return bytesToHex(await hkdf(ikm, PASSKEY_SALT, ''));
};

// --- Recovery code: the master factor, base32 (Crockford) with a 2-byte checksum ---

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B32.length; i++) B32_LOOKUP[B32[i]] = i;
// Common misreads map onto the intended digit.
B32_LOOKUP['O'] = 0;
B32_LOOKUP['I'] = 1;
B32_LOOKUP['L'] = 1;

const base32Encode = (bytes: Uint8Array): string => {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (text: string, expectedBytes: number): Uint8Array | null => {
  const bytes = new Uint8Array(expectedBytes);
  let bits = 0;
  let value = 0;
  let idx = 0;
  for (const ch of text) {
    const v = B32_LOOKUP[ch];
    if (v === undefined) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      if (idx >= expectedBytes) return null;
      bytes[idx++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  // The last character's unused low bits must be zero, so exactly one string
  // encodes a given master.
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) return null;
  return idx === expectedBytes ? bytes : null;
};

const checksum = async (master: Uint8Array): Promise<Uint8Array> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', master.buffer as ArrayBuffer));
  return digest.slice(0, 2);
};

/** 55 characters in groups of five, e.g. `K7QX3-M2P9A-...`. */
export const encodeRecoveryCode = async (masterHex: string): Promise<string> => {
  const master = hexToBytes(masterHex);
  const payload = new Uint8Array(34);
  payload.set(master, 0);
  payload.set(await checksum(master), 32);
  const raw = base32Encode(payload);
  return raw.match(/.{1,5}/g)!.join('-');
};

/** Returns the master factor as hex, or null if the code is malformed or fails its checksum. */
export const decodeRecoveryCode = async (code: string): Promise<string | null> => {
  const cleaned = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (cleaned.length !== 55) return null;
  const payload = base32Decode(cleaned, 34);
  if (!payload) return null;
  const master = payload.slice(0, 32);
  const expected = await checksum(master);
  if (payload[32] !== expected[0] || payload[33] !== expected[1]) return null;
  return bytesToHex(master);
};

// --- USB backup: bytes encrypted under a key derived from the session passKey ---

const BACKUP_SALT = 'yours-usb-backup-v1';

/** Extra PBKDF2 rounds on top of the combined passKey. Native WebCrypto, so cheap for us, costly per guess. */
export const BACKUP_KDF_ITERATIONS = 600_000;

/**
 * Key for files written to the drive. The drive carries the key file too, so
 * for a lost drive the password is the only remaining factor: the backup is
 * an offline guessing target like an exported backup file. This adds a
 * deliberately slow step on top of the passKey to raise the cost per guess.
 * Restore needs exactly what unlock needs: the drive's own secret plus the
 * password. The stick id is mixed in so each drive's files are under their
 * own key: ciphertext from one drive means nothing on another.
 */
export const deriveBackupKey = async (passKeyHex: string, stickId: string): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey('raw', hexToBytes(passKeyHex).buffer as ArrayBuffer, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(BACKUP_SALT).buffer as ArrayBuffer,
      iterations: BACKUP_KDF_ITERATIONS,
    },
    base,
    256,
  );
  return importAesKey(await hkdf(new Uint8Array(bits), BACKUP_SALT, `aes|${stickId}`));
};

/**
 * iv (12 bytes) || ciphertext. `aad` names what the file is (drive, role,
 * account, chunk index) so a ciphertext moved to another name or slot fails
 * to open instead of being taken for the file it replaced.
 */
export const encryptBytes = async (key: CryptoKey, plain: Uint8Array, aad = ''): Promise<Uint8Array> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(aad).buffer as ArrayBuffer },
      key,
      plain.buffer as ArrayBuffer,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
};

export const decryptBytes = async (key: CryptoKey, data: Uint8Array, aad = ''): Promise<Uint8Array> => {
  if (data.length < 13) throw new Error('Encrypted data too short');
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: enc.encode(aad).buffer as ArrayBuffer },
      key,
      ct.buffer as ArrayBuffer,
    ),
  );
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
};

export const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};
