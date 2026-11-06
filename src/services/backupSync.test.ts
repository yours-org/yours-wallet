import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { PrivateKey } from '@bsv/sdk';
import { StorageIdb, StorageProvider, WalletStorageManager } from '@bsv/wallet-toolbox-client';
import { pushBackups } from './backupSync';
import { initialOffsets } from './usbBackupBackground';

const identityKey = PrivateKey.fromRandom().toPublicKey().toString();

/** Each store in its own IndexedDB database: `StorageIdb` names the database by chain, not by store. */
const openStore = async (name: string, storageIdentityKey: string): Promise<StorageIdb> => {
  const store = new StorageIdb(StorageProvider.createStorageBaseOptions('test'));
  store.dbName = name;
  await store.migrate(name, storageIdentityKey);
  await store.makeAvailable();
  return store;
};

/** An active store and one backup, registered the way the wallet factory does it. */
const openWallet = async (suffix: string) => {
  const active = await openStore(`active-${suffix}`, `active-${suffix}`);
  const backup = await openStore(`backup-${suffix}`, `backup-${suffix}`);
  const storage = new WalletStorageManager(identityKey, active, [backup]);
  await storage.makeAvailable();
  if (!storage.isActiveEnabled) await storage.setActive(`active-${suffix}`);
  return { storage, active, backup };
};

describe('pushBackups', () => {
  test('rows written to the active store arrive in the backup', async () => {
    const { storage, backup } = await openWallet('a');
    const userId = await storage.getUserId();
    await storage.runAsWriter(async (writer) => {
      await (writer as StorageIdb).findOrInsertOutputBasket(userId, 'p color test');
    });
    expect(await backup.findOutputBaskets({ partial: { name: 'p color test' } })).toHaveLength(0);

    const [result] = await pushBackups(storage);
    expect(result.error).toBeUndefined();
    expect(result.inserts).toBeGreaterThan(0);

    const copied = await backup.findOutputBaskets({ partial: { name: 'p color test' } });
    expect(copied).toHaveLength(1);
  });

  test('a second push after no change moves nothing', async () => {
    const { storage } = await openWallet('b');
    await pushBackups(storage);
    const [again] = await pushBackups(storage);
    expect(again.inserts).toBe(0);
    expect(again.updates).toBe(0);
  });

  test('the backup store serves the pushed rows as a sync chunk, as the USB backup reads them', async () => {
    const { storage, backup } = await openWallet('c');
    const userId = await storage.getUserId();
    await storage.runAsWriter(async (writer) => {
      await (writer as StorageIdb).findOrInsertOutputBasket(userId, 'usb sees this');
    });
    await pushBackups(storage);

    const chunk = await backup.getSyncChunk({
      identityKey,
      fromStorageIdentityKey: 'backup-c',
      toStorageIdentityKey: 'usb',
      maxRoughSize: 1_000_000,
      maxItems: 1000,
      offsets: initialOffsets(),
    });
    expect(chunk.outputBaskets?.map((b) => b.name)).toContain('usb sees this');
  });
});
