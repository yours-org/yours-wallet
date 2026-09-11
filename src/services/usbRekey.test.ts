import { describe, expect, test } from 'bun:test';
import { allAccountsDecrypt, findStaleAccounts, rekeyAccounts } from './usbRekey';
import { decrypt, deriveKey, encrypt } from '../utils/crypto';
import type { Account } from './types/chromeStorage.types';

const KEYS = JSON.stringify({ walletWif: 'L1', identityWif: 'L2', walletAddress: '1abc' });

const account = async (passKey: string, overrides: Partial<Account> = {}): Promise<Account> =>
  ({
    name: 'A',
    icon: '',
    encryptedKeys: await encrypt(KEYS, passKey),
    ...overrides,
  }) as unknown as Account;

describe('rekeyAccounts', () => {
  test('re-encrypts every account and tags the epoch', async () => {
    const oldKey = deriveKey('pw', 'salt');
    const newKey = deriveKey('pw2', 'salt');
    const accounts = { a: await account(oldKey), b: await account(oldKey, { name: 'B' }) };
    const { accounts: out, count } = await rekeyAccounts(accounts, oldKey, newKey, 3);
    expect(count).toBe(2);
    for (const id of ['a', 'b']) {
      expect(out[id].keyEpoch).toBe(3);
      expect(out[id].encryptedKeys).not.toBe(accounts[id as 'a' | 'b'].encryptedKeys);
      expect(await decrypt(out[id].encryptedKeys, newKey)).toBe(KEYS);
    }
    expect(out.b.name).toBe('B');
  });

  test('throws and returns nothing when one account is under a different key', async () => {
    const oldKey = deriveKey('pw', 'salt');
    const other = deriveKey('x', 'salt');
    const accounts = { a: await account(oldKey), b: await account(other) };
    await expect(rekeyAccounts(accounts, oldKey, deriveKey('n', 'salt'), 1)).rejects.toBeDefined();
  });

  test('passes accounts with no encryptedKeys through untouched', async () => {
    const oldKey = deriveKey('pw', 'salt');
    const empty = { name: 'E', icon: '', encryptedKeys: '' } as unknown as Account;
    const { accounts: out, count } = await rekeyAccounts({ e: empty }, oldKey, deriveKey('n', 'salt'), 1);
    expect(count).toBe(0);
    expect(out.e).toBe(empty);
  });
});

describe('findStaleAccounts / allAccountsDecrypt', () => {
  test('reports accounts behind the expected epoch, treating absent as 0', async () => {
    const key = deriveKey('pw', 'salt');
    const accounts = {
      fresh: await account(key, { keyEpoch: 2 }),
      stale: await account(key, { keyEpoch: 1 }),
      legacy: await account(key),
    };
    expect(findStaleAccounts(accounts, 2).sort()).toEqual(['legacy', 'stale']);
    expect(findStaleAccounts(accounts, 0)).toEqual(['fresh', 'stale']);
  });

  test('allAccountsDecrypt is true only when every blob opens', async () => {
    const key = deriveKey('pw', 'salt');
    const good = { a: await account(key), b: await account(key) };
    expect(await allAccountsDecrypt(good, key)).toBe(true);
    const mixed = { ...good, c: await account(deriveKey('other', 'salt')) };
    expect(await allAccountsDecrypt(mixed, key)).toBe(false);
  });
});

describe('validateUsbSecurity', () => {
  const good = {
    enabled: true,
    version: 1,
    kdfVersion: 1,
    masterCheck: 'a'.repeat(64),
    sticks: [{ id: '0123456789abcdef', label: 'Blue', wrappedMaster: 'v1:abc', addedAt: '2026-09-01T00:00:00Z' }],
  };
  test('accepts a well-formed object, with or without backup settings', async () => {
    const { validateUsbSecurity } = await import('./usbRekey');
    expect(validateUsbSecurity(good)).toBeNull();
    expect(validateUsbSecurity({ ...good, backup: { enabled: false, wipeAt: 'x' } })).toBeNull();
  });
  test('rejects a disabled, malformed, empty or duplicated set', async () => {
    const { validateUsbSecurity } = await import('./usbRekey');
    expect(validateUsbSecurity(null)).not.toBeNull();
    expect(validateUsbSecurity({ ...good, enabled: false })).not.toBeNull();
    expect(validateUsbSecurity({ ...good, masterCheck: 'zz' })).not.toBeNull();
    expect(validateUsbSecurity({ ...good, sticks: [] })).not.toBeNull();
    expect(validateUsbSecurity({ ...good, sticks: [good.sticks[0], good.sticks[0]] })).not.toBeNull();
    expect(validateUsbSecurity({ ...good, sticks: [{ ...good.sticks[0], id: 'short' }] })).not.toBeNull();
    expect(validateUsbSecurity({ ...good, backup: { enabled: 'yes' } })).not.toBeNull();
  });
});
