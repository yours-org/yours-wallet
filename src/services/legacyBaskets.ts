import type { StorageProvider, WalletStorageManager } from '@bsv/wallet-toolbox-client';

/**
 * Legacy 'p 1sat …' baskets and the baskets their outputs belong in. Matches
 * the '2026-09-30-002 re-file legacy p 1sat baskets' migration that
 * @1sat/wallet-node runs on remote storage.
 */
const LEGACY_BASKETS: [legacy: string, target: string][] = [
  ['p 1sat ordinals', '1sat'],
  ['ordinals', '1sat'],
  ['p 1sat bsv21', 'bsv21'],
  ['p 1sat opns', 'opns'],
  ['p 1sat lock', 'lock'],
  ['p 1sat sigma', 'sigma'],
  ['p 1sat bsocial', 'bsocial'],
];

/**
 * Re-file the account's outputs out of legacy baskets in the local IndexedDB
 * store, in one transaction. The wallet interface cannot reclassify an output
 * that already has a basket, so this works on storage records directly: a
 * legacy basket is renamed when no target basket exists, otherwise its outputs
 * are re-pointed. updated_at is bumped so sync carries the change to backups.
 */
export const refileLegacyBaskets = async (storage: WalletStorageManager): Promise<void> => {
  const local = storage._stores.map((s) => s.storage).find((p) => p.isStorageProvider()) as StorageProvider | undefined;
  if (!local) return;
  const { identityKey } = await storage.getAuth();
  const { user } = await local.findOrInsertUser(identityKey);
  const userId = user.userId;

  await local.transaction(async (trx) => {
    const now = new Date();
    for (const [legacy, target] of LEGACY_BASKETS) {
      const [legacyBasket] = await local.findOutputBaskets({ partial: { userId, name: legacy }, trx });
      if (!legacyBasket) continue;
      const [targetBasket] = await local.findOutputBaskets({ partial: { userId, name: target }, trx });
      const outputs = await local.findOutputs({
        partial: { userId, basketId: legacyBasket.basketId },
        noScript: true,
        trx,
      });
      if (!targetBasket) {
        await local.updateOutputBasket(legacyBasket.basketId, { name: target, updated_at: now }, trx);
        for (const o of outputs) await local.updateOutput(o.outputId, { updated_at: now }, trx);
        continue;
      }
      if (targetBasket.isDeleted && outputs.length > 0) {
        await local.updateOutputBasket(targetBasket.basketId, { isDeleted: false, updated_at: now }, trx);
      }
      for (const o of outputs) {
        await local.updateOutput(o.outputId, { basketId: targetBasket.basketId, updated_at: now }, trx);
      }
    }
  });
};
