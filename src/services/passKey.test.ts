import { describe, expect, test } from 'bun:test';
import { derivePassKey, derivePasswordKey, UsbKeyRequiredError } from './passKey';
import { combinePassKey, computeMasterCheck, newMaster } from '../utils/usbCrypto';
import type { UsbSecurity } from './types/chromeStorage.types';

const usbOn = async (master: string): Promise<UsbSecurity> => ({
  enabled: true,
  version: 1,
  kdfVersion: 1,
  masterCheck: await computeMasterCheck(master),
  sticks: [],
});

describe('derivePassKey', () => {
  test('with USB security off it is exactly the password key', async () => {
    const key = await derivePassKey('pw', 'salt', undefined);
    expect(key).toBe(derivePasswordKey('pw', 'salt'));
  });

  test('with USB security on it refuses without the master factor', async () => {
    const usb = await usbOn(newMaster());
    await expect(derivePassKey('pw', 'salt', usb)).rejects.toBeInstanceOf(UsbKeyRequiredError);
  });

  test('with USB security on it is the combined key and never the password key', async () => {
    const master = newMaster();
    const usb = await usbOn(master);
    const key = await derivePassKey('pw', 'salt', usb, { master });
    expect(key).toBe(await combinePassKey(derivePasswordKey('pw', 'salt'), master));
    expect(key).not.toBe(derivePasswordKey('pw', 'salt'));
  });
});
