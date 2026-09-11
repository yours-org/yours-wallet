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

describe('cursor helpers', () => {
  test('applyChunkToEntry advances offsets by the chunk counts and increments chunkCount', async () => {
    const { applyChunkToEntry, newManifestEntry } = await import('./usbBackup');
    const entry = newManifestEntry('key', 'addr', 'A');
    const next = applyChunkToEntry(entry, { transaction: 3, output: 7 });
    expect(next.chunkCount).toBe(1);
    expect(next.offsets.find((o) => o.name === 'transaction')?.offset).toBe(3);
    expect(next.offsets.find((o) => o.name === 'output')?.offset).toBe(7);
    expect(next.offsets.find((o) => o.name === 'provenTx')?.offset).toBe(0);
    expect(entry.chunkCount).toBe(0); // pure
  });

  test('finishPass moves the cursor to the pass start, resets offsets, marks complete', async () => {
    const { applyChunkToEntry, finishPass, newManifestEntry } = await import('./usbBackup');
    const written = applyChunkToEntry(newManifestEntry('key', 'addr', 'A'), { output: 5 });
    const done = finishPass(written, '2026-09-10T10:00:00.000Z', true, '2026-09-10T10:00:05.000Z');
    expect(done.since).toBe('2026-09-10T10:00:00.000Z');
    expect(done.complete).toBe(true);
    expect(done.chunkCount).toBe(1);
    expect(done.offsets.every((o) => o.offset === 0)).toBe(true);
    expect(done.lastBackupAt).toBe('2026-09-10T10:00:05.000Z');
    // A pass that wrote nothing keeps the previous timestamp.
    const idle = finishPass(done, '2026-09-10T11:00:00.000Z', false, '2026-09-10T11:00:01.000Z');
    expect(idle.lastBackupAt).toBe('2026-09-10T10:00:05.000Z');
    expect(idle.since).toBe('2026-09-10T11:00:00.000Z');
  });

  test('needsCompaction only after a complete pass with many increments', async () => {
    const { COMPACT_AFTER_CHUNKS, needsCompaction, newManifestEntry } = await import('./usbBackup');
    const e = newManifestEntry('key', 'addr', 'A');
    expect(needsCompaction({ ...e, chunkCount: COMPACT_AFTER_CHUNKS, complete: false })).toBe(false);
    expect(needsCompaction({ ...e, chunkCount: COMPACT_AFTER_CHUNKS - 1, complete: true })).toBe(false);
    expect(needsCompaction({ ...e, chunkCount: COMPACT_AFTER_CHUNKS, complete: true })).toBe(true);
  });
});
