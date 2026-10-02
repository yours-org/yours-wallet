import {
  EntitySyncState,
  type StorageClient,
  type StorageProvider,
  type TableSettings,
  type WalletStorageManager,
  type sdk,
} from '@bsv/wallet-toolbox-client';
import type { OneSatServices } from '@1sat/wallet-browser';
import {
  advanceOffsets,
  type ChainAnswers,
  type ChainTxStatus,
  decideSpend,
  diffIndexes,
  emptyIndex,
  indexChunk,
  initialOffsets,
  isFinalChunk,
  matchesVerdict,
  oneSidedCount,
  type ReconcileRecord,
  type SpendVerdict,
  type StoreIndex,
  txidsToCheck,
} from './storageReconcile';

export const RECONCILE_RECORD_KEY = 'storageReconcileLastRun';

/**
 * Sync state rows written by the reconcile are keyed under a separate reader
 * identity so full passes never disturb the incremental sync state that
 * WalletStorageManager keeps for the real store pair.
 */
const RECONCILE_KEY_SUFFIX = '~reconcile';
const MAX_ITEMS = 1000;
const MAX_ROUGH_SIZE = 10_000_000;
/** processSyncChunk writes row by row on the server; keep each push well inside the client's 30 s response timeout. */
const PUSH_MAX_ITEMS = 100;
const PUSH_MAX_ROUGH_SIZE = 1_000_000;
const SPENDS_BATCH = 100;

const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

const findStores = (
  storage: WalletStorageManager,
  remoteUrl: string,
): { local: StorageProvider; remote: StorageClient } => {
  const providers = storage._stores.map((s) => s.storage);
  const local = providers.find((p) => p.isStorageProvider()) as StorageProvider | undefined;
  const remote = providers.find(
    (p) => normalizeUrl((p as StorageClient).endpointUrl ?? '') === normalizeUrl(remoteUrl),
  ) as StorageClient | undefined;
  if (!local) throw new Error('Local storage is not loaded');
  if (!remote) throw new Error(`Remote storage ${remoteUrl} is not connected`);
  return { local, remote };
};

/** Read-only full dump of one store, reduced to the index the diff needs. */
const readIndex = async (
  reader: sdk.WalletStorageProvider,
  identityKey: string,
  readerKey: string,
): Promise<StoreIndex> => {
  const index = emptyIndex();
  const args: sdk.RequestSyncChunkArgs = {
    identityKey,
    fromStorageIdentityKey: readerKey,
    toStorageIdentityKey: readerKey + RECONCILE_KEY_SUFFIX,
    maxItems: MAX_ITEMS,
    maxRoughSize: MAX_ROUGH_SIZE,
    offsets: initialOffsets(),
  };
  for (;;) {
    const chunk = await reader.getSyncChunk(args);
    indexChunk(index, chunk);
    if (isFinalChunk(chunk)) return index;
    if (advanceOffsets(args.offsets, chunk) === 0) throw new Error('Sync read made no progress');
  }
};

/**
 * Push reader rows into writer through processSyncChunk. `full` sends every
 * row regardless of timestamps; otherwise only rows changed since the last
 * reconcile pass for this pair. User rows are never sent so neither store's
 * activeStorage changes.
 */
const push = async (
  reader: sdk.WalletStorageProvider,
  readerSettings: TableSettings,
  writer: sdk.WalletStorageProvider,
  writerSettings: TableSettings,
  identityKey: string,
  full: boolean,
): Promise<{ inserts: number; updates: number }> => {
  const from: TableSettings = {
    ...readerSettings,
    storageIdentityKey: readerSettings.storageIdentityKey + RECONCILE_KEY_SUFFIX,
    storageName: readerSettings.storageName + RECONCILE_KEY_SUFFIX,
  };
  const totals = { inserts: 0, updates: 0 };

  const pass = async (since: 'none' | 'state') => {
    for (;;) {
      const ss = await EntitySyncState.fromStorage(writer, identityKey, from);
      const args = ss.makeRequestSyncChunkArgs(
        identityKey,
        writerSettings.storageIdentityKey,
        PUSH_MAX_ROUGH_SIZE,
        PUSH_MAX_ITEMS,
      );
      if (since === 'none') args.since = undefined;
      const { user: _user, ...chunk } = await reader.getSyncChunk(args);
      const r = await writer.processSyncChunk(args, chunk);
      if (r.error) throw r.error;
      totals.inserts += r.inserts;
      totals.updates += r.updates;
      if (r.done) return;
    }
  };

  if (full) {
    // A previously interrupted pass leaves non-zero offsets; finish it so the full pass starts at zero.
    const ss = await EntitySyncState.fromStorage(writer, identityKey, from);
    const resuming = ss
      .makeRequestSyncChunkArgs(identityKey, writerSettings.storageIdentityKey)
      .offsets.some((o) => o.offset > 0);
    if (resuming) await pass('none');
  }
  await pass(full ? 'none' : 'state');
  return totals;
};

const askChain = async (services: OneSatServices, outpoints: string[], txids: string[]): Promise<ChainAnswers> => {
  const spends = new Map<string, string | null>();
  for (let i = 0; i < outpoints.length; i += SPENDS_BATCH) {
    const batch = outpoints.slice(i, i + SPENDS_BATCH);
    const result = await services.txo.getSpends(batch.map((o) => o.replace('.', '_')));
    batch.forEach((o, j) => spends.set(o, result[j] ?? null));
  }
  const statuses = new Map<string, ChainTxStatus>();
  if (txids.length > 0) {
    const { results } = await services.getStatusForTxids(txids);
    for (const r of results) statuses.set(r.txid, r.status);
  }
  return { spends, statuses };
};

/** Write the verdict onto the local output row; the fresh updated_at carries it to the remote. */
const applyVerdict = async (
  local: StorageProvider,
  userId: number,
  txid: string,
  vout: number,
  verdict: SpendVerdict,
): Promise<boolean> => {
  if (verdict.kind === 'unresolved') return false;
  const [tx] = await local.findTransactions({ partial: { userId, txid } });
  if (!tx) return false;
  const [output] = await local.findOutputs({ partial: { userId, transactionId: tx.transactionId, vout } });
  if (!output) return false;
  if (verdict.kind === 'unspent') {
    await local.updateOutput(output.outputId, { spendable: true, spentBy: undefined });
    return true;
  }
  const [spender] = await local.findTransactions({ partial: { userId, txid: verdict.txid } });
  await local.updateOutput(output.outputId, { spendable: false, spentBy: spender?.transactionId });
  return true;
};

/**
 * Bring local and remote storage to the union of both, with conflicting
 * spends settled by the chain. Holds the storage sync lock throughout, so no
 * wallet activity interleaves. The record is saved even when a step fails.
 */
export const reconcileStorage = async (
  storage: WalletStorageManager,
  services: OneSatServices,
  remoteUrl: string,
): Promise<ReconcileRecord> => {
  const record: ReconcileRecord = { startedAt: new Date().toISOString(), remoteUrl };
  try {
    const { identityKey } = await storage.getAuth();
    const { local, remote } = findStores(storage, remoteUrl);

    await storage.runAsSync(async () => {
      const localSettings = await local.makeAvailable();
      const remoteSettings = await remote.makeAvailable();
      record.localStorageIdentityKey = localSettings.storageIdentityKey;
      record.remoteStorageIdentityKey = remoteSettings.storageIdentityKey;

      const localIndex = await readIndex(local, identityKey, localSettings.storageIdentityKey);
      const remoteIndex = await readIndex(remote, identityKey, remoteSettings.storageIdentityKey);
      const diff = diffIndexes(localIndex, remoteIndex);
      record.onlyLocal = diff.onlyLocal;
      record.onlyRemote = diff.onlyRemote;

      const chain = await askChain(
        services,
        diff.spendConflicts.map((c) => c.outpoint),
        txidsToCheck(diff.spendConflicts),
      );
      const conflicts = diff.spendConflicts.map((c) => ({
        ...c,
        verdict: decideSpend(c, localIndex, remoteIndex, chain),
      }));
      record.spendConflicts = conflicts;

      record.pushedToRemote = await push(local, localSettings, remote, remoteSettings, identityKey, true);
      record.pushedToLocal = await push(remote, remoteSettings, local, localSettings, identityKey, true);

      const { user } = await local.findOrInsertUser(identityKey);
      record.corrected = [];
      for (const c of conflicts) {
        if (await applyVerdict(local, user.userId, c.txid, c.vout, c.verdict)) record.corrected.push(c.outpoint);
      }
      if (record.corrected.length > 0) {
        record.pushedCorrections = await push(local, localSettings, remote, remoteSettings, identityKey, false);
      }

      const localAfter = await readIndex(local, identityKey, localSettings.storageIdentityKey);
      const remoteAfter = await readIndex(remote, identityKey, remoteSettings.storageIdentityKey);
      const after = diffIndexes(localAfter, remoteAfter);
      record.verify = {
        onlyLocal: oneSidedCount(after.onlyLocal),
        onlyRemote: oneSidedCount(after.onlyRemote),
        mismatched: conflicts
          .filter((c) => c.verdict.kind !== 'unresolved')
          .filter(
            (c) =>
              !matchesVerdict(localAfter, c.outpoint, c.verdict) || !matchesVerdict(remoteAfter, c.outpoint, c.verdict),
          )
          .map((c) => c.outpoint),
      };
    });
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    await chrome.storage.local.set({ [RECONCILE_RECORD_KEY]: record });
  }
};
