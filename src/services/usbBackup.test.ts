import { describe, expect, test } from 'bun:test';
import {
  applyChunkToEntry,
  backupAad,
  COMPACT_AFTER_CHUNKS,
  finishPass,
  FULL_PASS_INTERVAL_MS,
  MIN_COMPACT_INTERVAL_MS,
  needsCompaction,
  newManifestEntry,
  startPass,
  summariseUsbBackup,
  USB_BACKUP_STALE_MS,
  usbBackupEnabled,
  usbBackupTotalBytes,
  usbBackupWipePending,
} from './usbBackup';
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

describe('usbBackupEnabled / usbBackupWipePending', () => {
  test('on by default when USB unlock is on; off when disabled or USB unlock off', () => {
    expect(usbBackupEnabled(usb)).toBe(true);
    expect(usbBackupEnabled({ ...usb, backup: { enabled: false } })).toBe(false);
    expect(usbBackupEnabled(undefined)).toBe(false);
  });

  test('a wipe is pending only while backup is off with a wipe time and some key not yet erased since', () => {
    const wipeAt = '2026-09-10T10:00:00.000Z';
    expect(usbBackupWipePending(usb)).toBe(false);
    expect(usbBackupWipePending({ ...usb, backup: { enabled: false } })).toBe(false);
    expect(usbBackupWipePending({ ...usb, backup: { enabled: false, wipeAt } })).toBe(true);
    const erased = usb.sticks.map((s) => ({ ...s, backupWipedAt: '2026-09-10T11:00:00.000Z' }));
    expect(usbBackupWipePending({ ...usb, backup: { enabled: false, wipeAt }, sticks: erased })).toBe(false);
    // Erased before the latest switch-off: still pending.
    const stale = usb.sticks.map((s) => ({ ...s, backupWipedAt: '2026-09-10T09:00:00.000Z' }));
    expect(usbBackupWipePending({ ...usb, backup: { enabled: false, wipeAt }, sticks: stale })).toBe(true);
  });
});

describe('summariseUsbBackup', () => {
  test('reports the newest backup per key and flags stale or never', () => {
    const now = Date.parse('2026-09-10T12:00:00Z');
    const fresh = new Date(now - 60_000).toISOString();
    const old = new Date(now - USB_BACKUP_STALE_MS - 1).toISOString();
    const status = {
      acct1: { lastBackupAt: old, stickIds: ['a', 'b'], bytes: 10 },
      acct2: { lastBackupAt: fresh, stickIds: ['a'], bytes: 5 },
    };
    const [a, b] = summariseUsbBackup(usb, status, now);
    expect(a).toEqual({ stickId: 'a', lastBackupAt: fresh, stale: false });
    expect(b).toEqual({ stickId: 'b', lastBackupAt: old, stale: true });
    expect(summariseUsbBackup(usb, undefined, now)[0]).toEqual({ stickId: 'a', lastBackupAt: undefined, stale: true });
    expect(usbBackupTotalBytes(status)).toBe(15);
    expect(usbBackupTotalBytes(undefined)).toBe(0);
  });

  test('a recently registered key is not overdue; an old one with no backups is', () => {
    const now = Date.parse('2026-09-10T12:00:00Z');
    const recent = new Date(now - 60_000).toISOString();
    const long = new Date(now - USB_BACKUP_STALE_MS - 1).toISOString();
    const u: UsbSecurity = {
      ...usb,
      sticks: [
        { id: 'new', label: 'New', wrappedMaster: '', addedAt: recent },
        { id: 'old', label: 'Old', wrappedMaster: '', addedAt: long },
      ],
    };
    const [n, o] = summariseUsbBackup(u, undefined, now);
    expect(n.stale).toBe(false);
    expect(o.stale).toBe(true);
  });
});

describe('cursor helpers', () => {
  test('a new entry gets an opaque folder name, not the account address', () => {
    const e = newManifestEntry('key', 'addr', 'A');
    expect(e.dir).toMatch(/^[0-9a-f]{16}$/);
    expect(e.dir).not.toBe('addr');
    expect(newManifestEntry('key', 'addr', 'A').dir).not.toBe(e.dir);
    expect(e.bytes).toBe(0);
    expect(e.storageMode).toBe('local');
  });

  test('applyChunkToEntry advances offsets by the chunk counts, increments chunkCount, adds bytes', () => {
    const entry = newManifestEntry('key', 'addr', 'A');
    const next = applyChunkToEntry(entry, { transaction: 3, output: 7 }, 1234);
    expect(next.chunkCount).toBe(1);
    expect(next.bytes).toBe(1234);
    expect(next.offsets.find((o) => o.name === 'transaction')?.offset).toBe(3);
    expect(next.offsets.find((o) => o.name === 'output')?.offset).toBe(7);
    expect(next.offsets.find((o) => o.name === 'provenTx')?.offset).toBe(0);
    expect(entry.chunkCount).toBe(0); // pure
  });

  test('startPass pins the start once; finishPass moves the cursor to it, not to the resume time', () => {
    const entry = newManifestEntry('key', 'addr', 'A', 'local', 'd1');
    const started = startPass(entry, '2026-09-08T10:00:00.000Z');
    expect(started.passStartedAt).toBe('2026-09-08T10:00:00.000Z');
    // Interrupted, resumed two days later: the pinned start survives.
    const resumed = startPass(applyChunkToEntry(started, { output: 5 }), '2026-09-10T10:00:00.000Z');
    expect(resumed.passStartedAt).toBe('2026-09-08T10:00:00.000Z');
    const done = finishPass(resumed, true, '2026-09-10T10:00:05.000Z');
    expect(done.since).toBe('2026-09-08T10:00:00.000Z');
    expect(done.passStartedAt).toBeUndefined();
    expect(done.complete).toBe(true);
    expect(done.chunkCount).toBe(1);
    expect(done.offsets.every((o) => o.offset === 0)).toBe(true);
    expect(done.lastBackupAt).toBe('2026-09-10T10:00:05.000Z');
    // It was a full pass: the snapshot size and time are recorded.
    expect(done.snapshotChunks).toBe(1);
    expect(done.lastFullPassAt).toBe('2026-09-10T10:00:05.000Z');
    // An incremental pass that wrote nothing keeps the previous timestamp and snapshot.
    const idle = finishPass(startPass(done, '2026-09-11T11:00:00.000Z'), false, '2026-09-11T11:00:01.000Z');
    expect(idle.lastBackupAt).toBe('2026-09-10T10:00:05.000Z');
    expect(idle.since).toBe('2026-09-11T11:00:00.000Z');
    expect(idle.snapshotChunks).toBe(1);
    expect(idle.lastFullPassAt).toBe('2026-09-10T10:00:05.000Z');
  });

  test('needsCompaction: never from an incomplete entry; by count only after the interval; by age; on store change', () => {
    const now = Date.parse('2026-09-10T12:00:00Z');
    const recent = new Date(now - 60_000).toISOString();
    const sixHoursAgo = new Date(now - MIN_COMPACT_INTERVAL_MS - 1).toISOString();
    const eightDaysAgo = new Date(now - FULL_PASS_INTERVAL_MS - 1).toISOString();
    const base = { ...newManifestEntry('key', 'addr', 'A', 'local', 'd1'), complete: true, snapshotChunks: 10 };
    expect(needsCompaction({ ...base, complete: false, chunkCount: 100 }, 'local', now)).toBe(false);
    // Count reached but the last full pass is recent: wait.
    expect(needsCompaction({ ...base, chunkCount: COMPACT_AFTER_CHUNKS, lastFullPassAt: recent }, 'local', now)).toBe(
      false,
    );
    expect(
      needsCompaction({ ...base, chunkCount: COMPACT_AFTER_CHUNKS, lastFullPassAt: sixHoursAgo }, 'local', now),
    ).toBe(true);
    // A big snapshot raises the threshold: 2x the snapshot, never below the floor.
    const big = { ...base, snapshotChunks: 50, lastFullPassAt: sixHoursAgo };
    expect(needsCompaction({ ...big, chunkCount: 99 }, 'local', now)).toBe(false);
    expect(needsCompaction({ ...big, chunkCount: 100 }, 'local', now)).toBe(true);
    // Age alone forces a full pass.
    expect(needsCompaction({ ...base, chunkCount: 1, lastFullPassAt: eightDaysAgo }, 'local', now)).toBe(true);
    // A change of active store forces one regardless.
    expect(needsCompaction({ ...base, chunkCount: 1, lastFullPassAt: recent }, 'remote', now)).toBe(true);
  });

  test('backupAad names the drive, the role and the place', () => {
    expect(backupAad('ab', 'chunk', 'd1', 7)).toBe('yours-usb-backup|3|ab|chunk|d1|7');
    expect(backupAad('ab', 'keys')).toBe('yours-usb-backup|3|ab|keys');
    expect(backupAad('ab', 'keys')).not.toBe(backupAad('cd', 'keys'));
  });
});
