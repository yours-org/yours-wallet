import { describe, expect, test } from 'bun:test';
import { summariseUsbBackup, USB_BACKUP_STALE_MS, usbBackupEnabled } from './usbBackup';
import type { UsbSecurity } from './types/chromeStorage.types';

const usb: UsbSecurity = {
  enabled: true,
  version: 1,
  kdfVersion: 1,
  masterCheck: 'x',
  sticks: [
    { id: 'a', label: 'A', wrappedMaster: '', addedAt: '' },
    { id: 'b', label: 'B', wrappedMaster: '', addedAt: '' },
  ],
};

describe('usbBackupEnabled', () => {
  test('on by default when USB unlock is on; off when disabled or USB unlock off', () => {
    expect(usbBackupEnabled(usb)).toBe(true);
    expect(usbBackupEnabled({ ...usb, backup: { enabled: false } })).toBe(false);
    expect(usbBackupEnabled(undefined)).toBe(false);
  });
});

describe('summariseUsbBackup', () => {
  test('reports the newest backup per key and flags stale or never', () => {
    const now = Date.parse('2026-09-10T12:00:00Z');
    const fresh = new Date(now - 60_000).toISOString();
    const old = new Date(now - USB_BACKUP_STALE_MS - 1).toISOString();
    const status = {
      acct1: { lastBackupAt: old, stickIds: ['a', 'b'] },
      acct2: { lastBackupAt: fresh, stickIds: ['a'] },
    };
    const [a, b] = summariseUsbBackup(usb, status, now);
    expect(a).toEqual({ stickId: 'a', lastBackupAt: fresh, stale: false });
    expect(b).toEqual({ stickId: 'b', lastBackupAt: old, stale: true });
    expect(summariseUsbBackup(usb, undefined, now)[0]).toEqual({ stickId: 'a', lastBackupAt: undefined, stale: true });
  });
});
