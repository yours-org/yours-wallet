import { describe, expect, test } from 'bun:test';
import {
  combinePassKey,
  computeMasterCheck,
  decodeRecoveryCode,
  encodeRecoveryCode,
  newMaster,
  newStickId,
  newStickSecret,
  parseStickFile,
  serializeStickFile,
  unwrapMaster,
  verifyMasterCheck,
  wrapMaster,
  USB_FILE_FORMAT,
  USB_FILE_VERSION,
} from './usbCrypto';
import { decrypt, deriveKey, encrypt } from './crypto';

describe('wrap / unwrap master', () => {
  test('round-trips under the right secret and id', async () => {
    const master = newMaster();
    const secret = newStickSecret();
    const id = newStickId();
    const wrapped = await wrapMaster(master, secret, id);
    expect(wrapped.startsWith('usb1:')).toBe(true);
    expect(await unwrapMaster(wrapped, secret, id)).toBe(master);
  });

  test('fails under a different secret', async () => {
    const wrapped = await wrapMaster(newMaster(), newStickSecret(), 'aaaaaaaaaaaaaaaa');
    await expect(unwrapMaster(wrapped, newStickSecret(), 'aaaaaaaaaaaaaaaa')).rejects.toBeDefined();
  });

  test('fails when the stick id (AAD) does not match', async () => {
    const secret = newStickSecret();
    const wrapped = await wrapMaster(newMaster(), secret, 'aaaaaaaaaaaaaaaa');
    await expect(unwrapMaster(wrapped, secret, 'bbbbbbbbbbbbbbbb')).rejects.toBeDefined();
  });

  test('two wrappers of the same master differ and both unwrap', async () => {
    const master = newMaster();
    const s1 = newStickSecret();
    const s2 = newStickSecret();
    const w1 = await wrapMaster(master, s1, 'aaaaaaaaaaaaaaaa');
    const w2 = await wrapMaster(master, s2, 'bbbbbbbbbbbbbbbb');
    expect(w1).not.toBe(w2);
    expect(await unwrapMaster(w1, s1, 'aaaaaaaaaaaaaaaa')).toBe(master);
    expect(await unwrapMaster(w2, s2, 'bbbbbbbbbbbbbbbb')).toBe(master);
  });
});

describe('master check', () => {
  test('verifies the right master and rejects another', async () => {
    const master = newMaster();
    const check = await computeMasterCheck(master);
    expect(check).toHaveLength(64);
    expect(await verifyMasterCheck(master, check)).toBe(true);
    expect(await verifyMasterCheck(newMaster(), check)).toBe(false);
  });
});

describe('combined passKey', () => {
  test('is deterministic, 32 bytes, and differs from pbkdf and per master', async () => {
    const pbkdf = deriveKey('correct horse', 'salt');
    const master = newMaster();
    const a = await combinePassKey(pbkdf, master);
    const b = await combinePassKey(pbkdf, master);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(pbkdf);
    expect(await combinePassKey(pbkdf, newMaster())).not.toBe(a);
    expect(await combinePassKey(deriveKey('other', 'salt'), master)).not.toBe(a);
  });

  test('works as an AES-GCM key with the existing encrypt/decrypt', async () => {
    const key = await combinePassKey(deriveKey('pw', 'salt'), newMaster());
    const blob = await encrypt('{"hello":"world"}', key);
    expect(await decrypt(blob, key)).toBe('{"hello":"world"}');
  });
});

describe('recovery code', () => {
  test('round-trips and is grouped', async () => {
    const master = newMaster();
    const code = await encodeRecoveryCode(master);
    expect(code).toMatch(/^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/);
    expect(await decodeRecoveryCode(code)).toBe(master);
  });

  test('tolerates lowercase, spaces, and common misreads', async () => {
    const master = newMaster();
    const code = await encodeRecoveryCode(master);
    const messy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    expect(await decodeRecoveryCode(messy)).toBe(master);
  });

  test('rejects a single-character corruption', async () => {
    const code = await encodeRecoveryCode(newMaster());
    const ch = code[7] === 'A' ? 'B' : 'A';
    const corrupted = code.slice(0, 7) + ch + code.slice(8);
    expect(await decodeRecoveryCode(corrupted)).toBeNull();
  });

  test('rejects wrong length and garbage', async () => {
    expect(await decodeRecoveryCode('ABC')).toBeNull();
    expect(await decodeRecoveryCode('')).toBeNull();
  });
});

describe('stick file', () => {
  test('parses what it serializes', () => {
    const file = {
      format: USB_FILE_FORMAT,
      version: USB_FILE_VERSION,
      id: newStickId(),
      secret: newStickSecret(),
    } as const;
    expect(parseStickFile(serializeStickFile(file))).toEqual(file);
  });

  test('rejects wrong shapes', () => {
    expect(parseStickFile('not json')).toBeNull();
    expect(parseStickFile('null')).toBeNull();
    expect(parseStickFile('{}')).toBeNull();
    expect(
      parseStickFile(JSON.stringify({ format: 'x', version: 1, id: 'a'.repeat(16), secret: 'b'.repeat(64) })),
    ).toBeNull();
    expect(
      parseStickFile(JSON.stringify({ format: USB_FILE_FORMAT, version: 1, id: 'zz', secret: 'b'.repeat(64) })),
    ).toBeNull();
    expect(
      parseStickFile(JSON.stringify({ format: USB_FILE_FORMAT, version: 1, id: 'a'.repeat(16), secret: 'short' })),
    ).toBeNull();
  });

  test('rejects oversized input before parsing', () => {
    expect(parseStickFile('{"a":"' + 'x'.repeat(5000) + '"}')).toBeNull();
  });
});

describe('backup bytes', () => {
  test('round-trips under the backup key and fails under another', async () => {
    const { deriveBackupKey, encryptBytes, decryptBytes, bytesToBase64, base64ToBytes } = await import('./usbCrypto');
    const key = await deriveBackupKey(deriveKey('pw', 'salt'), 'stick-a');
    const plain = new TextEncoder().encode('hello chunk');
    const enc = await encryptBytes(key, plain);
    expect(enc.length).toBe(12 + plain.length + 16);
    expect(new TextDecoder().decode(await decryptBytes(key, enc))).toBe('hello chunk');
    const other = await deriveBackupKey(deriveKey('pw2', 'salt'), 'stick-a');
    await expect(decryptBytes(other, enc)).rejects.toBeDefined();
    expect(base64ToBytes(bytesToBase64(enc))).toEqual(enc);
  });

  test('the key is per drive: the same passKey on another stick id does not open the bytes', async () => {
    const { deriveBackupKey, encryptBytes, decryptBytes } = await import('./usbCrypto');
    const a = await deriveBackupKey(deriveKey('pw', 'salt'), 'stick-a');
    const b = await deriveBackupKey(deriveKey('pw', 'salt'), 'stick-b');
    const enc = await encryptBytes(a, new TextEncoder().encode('x'));
    await expect(decryptBytes(b, enc)).rejects.toBeDefined();
  });

  test('additional data binds a file to its place: wrong role, folder or index fails', async () => {
    const { deriveBackupKey, encryptBytes, decryptBytes } = await import('./usbCrypto');
    const key = await deriveBackupKey(deriveKey('pw', 'salt'), 'stick-a');
    const plain = new TextEncoder().encode('chunk 3 of dir d1');
    const enc = await encryptBytes(key, plain, 'v3|stick-a|chunk|d1|3');
    expect(await decryptBytes(key, enc, 'v3|stick-a|chunk|d1|3')).toEqual(plain);
    await expect(decryptBytes(key, enc, 'v3|stick-a|chunk|d1|4')).rejects.toBeDefined();
    await expect(decryptBytes(key, enc, 'v3|stick-a|chunk|d2|3')).rejects.toBeDefined();
    await expect(decryptBytes(key, enc, 'v3|stick-a|keys')).rejects.toBeDefined();
    await expect(decryptBytes(key, enc)).rejects.toBeDefined();
  });
});
