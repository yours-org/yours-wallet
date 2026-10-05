import {
  EntitySyncState,
  type StorageClient,
  type StorageProvider,
  type TableSettings,
  type WalletStorageManager,
  type sdk,
} from '@bsv/wallet-toolbox-client';
import type { OneSatServices } from '@1sat/wallet-browser';
import type { ChromeStorageService } from './ChromeStorage.service';
import type { Account } from './types/chromeStorage.types';
import {
  chainCheckProof,
  checkProofStructure,
  rawTxMatches,
  rebuildProofFields,
  type ChainLookups,
  type ProvenTxRow,
} from './proofRepair';
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
  RECONCILE_HISTORY_KEY,
  RECONCILE_HISTORY_LIMIT,
  RECONCILE_RECORD_KEY,
  isSettled,
  type VerifyResult,
  type ReconcilePhase,
  type ReconcileRecord,
  type ProofRepair,
  type ReconcileTrigger,
  type SpendVerdict,
  type StoreIndex,
  txidsToCheck,
} from './storageReconcile';

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
/** A chunk rejected over a proof is repaired and resent at most this many times in a row. */
const MAX_PROOF_RETRIES = 3;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The writer refused a chunk over a proven-tx row in it (wallet-toolbox `validateSyncProof`). */
const isProofRejection = (error: unknown): boolean =>
  /provenTx parameter|server-verified proof/i.test(errorMessage(error));

/** The writer saw a proof row appear mid-merge, rolled back, and asks for the chunk again. */
const isRetrySynchronization = (error: unknown): boolean => /retry synchronization/i.test(errorMessage(error));

type ChunkProgress = (offsets: sdk.RequestSyncChunkArgs['offsets'], items: number) => Promise<void>;

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
  onChunk: ChunkProgress,
  inspect?: (chunk: sdk.SyncChunk) => void,
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
    await onChunk(args.offsets, 0);
    const chunk = await reader.getSyncChunk(args);
    indexChunk(index, chunk);
    inspect?.(chunk);
    if (isFinalChunk(chunk)) return index;
    const items = advanceOffsets(args.offsets, chunk);
    if (items === 0) throw new Error('Sync read made no progress');
    await onChunk(args.offsets, items);
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
  onChunk: ChunkProgress,
  /** Repair the proven-tx rows of a chunk the writer refused; returns how many changed. */
  onRejectedProofs?: (rows: ProvenTxRow[], error: unknown) => Promise<number>,
): Promise<{ inserts: number; updates: number }> => {
  const from: TableSettings = {
    ...readerSettings,
    storageIdentityKey: readerSettings.storageIdentityKey + RECONCILE_KEY_SUFFIX,
    storageName: readerSettings.storageName + RECONCILE_KEY_SUFFIX,
  };
  const totals = { inserts: 0, updates: 0 };

  const pass = async (since: 'none' | 'state') => {
    let rejections = 0;
    for (;;) {
      const ss = await EntitySyncState.fromStorage(writer, identityKey, from);
      const args = ss.makeRequestSyncChunkArgs(
        identityKey,
        writerSettings.storageIdentityKey,
        PUSH_MAX_ROUGH_SIZE,
        PUSH_MAX_ITEMS,
      );
      if (since === 'none') args.since = undefined;
      await onChunk(args.offsets, 0);
      const { user: _user, ...chunk } = await reader.getSyncChunk(args);
      let r: sdk.ProcessSyncChunkResult;
      try {
        r = await writer.processSyncChunk(args, chunk);
        if (r.error) throw r.error;
      } catch (error) {
        // The writer validates proofs before it opens its transaction (and
        // rolls back on the mid-merge race), so a refused chunk wrote nothing:
        // repair the proofs, or just resend when it asked for a retry.
        const rows = chunk.provenTxs ?? [];
        if (!onRejectedProofs || !isProofRejection(error) || rows.length === 0 || rejections >= MAX_PROOF_RETRIES) {
          throw error;
        }
        rejections++;
        if (isRetrySynchronization(error)) continue;
        if ((await onRejectedProofs(rows, error)) === 0) throw error;
        continue;
      }
      rejections = 0;
      totals.inserts += r.inserts;
      totals.updates += r.updates;
      await onChunk(args.offsets, r.inserts + r.updates);
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

const saveRecord = (record: ReconcileRecord) => chrome.storage.local.set({ [RECONCILE_RECORD_KEY]: record });

/**
 * Ask USB backup for a full pass of this account. Called after every repair
 * run, finished or not: rows a run copied from the remote into local keep
 * their original timestamps, so an incremental USB pass would skip them.
 */
export const requestUsbFullPass = (chromeStorageService: ChromeStorageService, identityAddress: string) =>
  chromeStorageService.updateNested('accounts', {
    [identityAddress]: { usbFullPassRequestedAt: new Date().toISOString() } as unknown as Account,
  });

/** Keep the finished run in the short history, so a later run never overwrites it. */
const archiveRecord = async (record: ReconcileRecord) => {
  const history = ((await chrome.storage.local.get(RECONCILE_HISTORY_KEY))[RECONCILE_HISTORY_KEY] ??
    []) as ReconcileRecord[];
  const rest = history.filter((r) => r.startedAt !== record.startedAt);
  await chrome.storage.local.set({ [RECONCILE_HISTORY_KEY]: [record, ...rest].slice(0, RECONCILE_HISTORY_LIMIT) });
};

export const readReconcileRecord = async (): Promise<ReconcileRecord | undefined> =>
  (await chrome.storage.local.get(RECONCILE_RECORD_KEY))[RECONCILE_RECORD_KEY] as ReconcileRecord | undefined;

/**
 * A run cut short by the service worker stopping never reaches its finally
 * block. Call at worker start so the record does not read as still running.
 */
export const finishInterruptedReconcile = async (): Promise<void> => {
  const record = await readReconcileRecord();
  if (!record || record.finishedAt) return;
  const interrupted = {
    ...record,
    finishedAt: new Date().toISOString(),
    error: 'Interrupted: the wallet restarted before the repair finished',
  };
  await saveRecord(interrupted);
  await archiveRecord(interrupted);
};

/**
 * Bring local and remote storage to the union of both, with conflicting
 * spends settled by the chain. Holds the storage sync lock throughout, so no
 * wallet activity interleaves. The record is saved as each phase starts and
 * after every chunk, so the popup can show progress and a failure leaves the
 * phase and offsets it stopped at.
 */
export const reconcileStorage = async (
  storage: WalletStorageManager,
  services: OneSatServices,
  remoteUrl: string,
  trigger: ReconcileTrigger,
): Promise<ReconcileRecord> => {
  const record: ReconcileRecord = {
    startedAt: new Date().toISOString(),
    trigger,
    appVersion: chrome.runtime.getManifest().version,
    remoteUrl,
  };
  const enter = async (phase: ReconcilePhase) => {
    record.phase = phase;
    record.phaseItems = 0;
    record.offsets = undefined;
    await saveRecord(record);
  };
  const onChunk: ChunkProgress = async (offsets, items) => {
    record.offsets = offsets.map((o) => ({ ...o }));
    record.phaseItems = (record.phaseItems ?? 0) + items;
    await saveRecord(record);
  };

  try {
    await saveRecord(record);
    const { identityKey } = await storage.getAuth();
    record.identityKey = identityKey;
    const { local, remote } = findStores(storage, remoteUrl);

    await storage.runAsSync(async () => {
      const localSettings = await local.makeAvailable();
      const remoteSettings = await remote.makeAvailable();
      record.localStorageIdentityKey = localSettings.storageIdentityKey;
      record.remoteStorageIdentityKey = remoteSettings.storageIdentityKey;

      // Proofs the server would refuse, found while reading local: one of them
      // in a chunk makes the server reject the whole chunk.
      const suspectProofs: ProvenTxRow[] = [];
      const inspectProofs = (chunk: sdk.SyncChunk) => {
        for (const p of chunk.provenTxs ?? [])
          if (!checkProofStructure(p).ok || !rawTxMatches(p)) suspectProofs.push(p);
      };

      // One header fetch per height for the whole run; a failed fetch is not kept.
      const headers = new Map<number, Promise<number[]>>();
      const headerAt = (height: number) => {
        let h = headers.get(height);
        if (!h) {
          h = services.getHeaderForHeight(height);
          headers.set(height, h);
          h.catch(() => headers.delete(height));
        }
        return h;
      };
      const chainLookups = async (): Promise<ChainLookups> => {
        const tracker = await services.getChainTracker();
        return {
          isValidRootForHeight: (root, height) => tracker.isValidRootForHeight(root, height),
          getHeaderForHeight: headerAt,
        };
      };

      /**
       * Make the local proven-tx row for this txid acceptable to the server:
       * fix it in place when the row itself has the answer, otherwise replace
       * the proof (and a corrupt raw transaction) from the network. `deep` adds
       * the server's chain checks, for rows in a chunk it already refused. The
       * row is looked up by txid: proven-tx ids differ between stores.
       */
      const repairProof = async (txid: string, stage: ProofRepair['stage'], deep: boolean) => {
        const note = (result: ProofRepair['result'], reason: string) =>
          (record.proofRepairs ??= []).push({ txid, stage, reason, result });
        const [row] = await local.findProvenTxs({ partial: { txid } });
        if (!row) {
          note('unrepaired', 'no proof for this transaction in local storage');
          return false;
        }
        const save = async (fields: Partial<ProvenTxRow>) =>
          local.updateProvenTx(row.provenTxId, { ...fields, updated_at: new Date() });

        const fields: Partial<ProvenTxRow> = {};
        const reasons: string[] = [];
        if (!rawTxMatches(row)) {
          reasons.push('raw transaction hash does not match txid');
          try {
            const fetched = await services.getRawTx(txid);
            if (!fetched.rawTx || !rawTxMatches({ txid, rawTx: fetched.rawTx })) {
              throw new Error(fetched.error?.message ?? 'no matching raw transaction');
            }
            fields.rawTx = fetched.rawTx;
          } catch (error) {
            note('unrepaired', `${reasons.join('; ')}; refetch failed: ${errorMessage(error)}`);
            return false;
          }
        }

        const structure = checkProofStructure(row);
        const lookups = deep ? await chainLookups() : undefined;
        if (!structure.ok) reasons.push(structure.reason);
        if (structure.ok || 'fix' in structure) {
          const candidate = 'fix' in structure ? { ...row, ...structure.fix } : row;
          // A lookup that throws counts against the row, which then takes the refetch path.
          const chainProblem = lookups
            ? await chainCheckProof(candidate, lookups).catch((error) => `chain lookup failed: ${errorMessage(error)}`)
            : null;
          if (!chainProblem) {
            if (structure.ok && !fields.rawTx) return false;
            await save({ ...fields, ...('fix' in structure ? structure.fix : {}) });
            note('fixed', reasons.join('; '));
            return true;
          }
          reasons.push(chainProblem);
        }

        try {
          const fetched = await services.getMerklePath(txid);
          if (!fetched.merklePath) throw new Error(fetched.error?.message ?? 'no proof returned');
          // Checked against the active header at its height, as the server does.
          const header = await headerAt(fetched.merklePath.blockHeight);
          const proof = rebuildProofFields(txid, fetched.merklePath, header);
          if (!proof) throw new Error('fetched proof does not match the active header');
          await save({ ...fields, ...proof });
          note('refetched', reasons.join('; '));
          return true;
        } catch (error) {
          note('unrepaired', `${reasons.join('; ')}; refetch failed: ${errorMessage(error)}`);
          return false;
        }
      };

      await enter('read-local');
      const localIndex = await readIndex(local, identityKey, localSettings.storageIdentityKey, onChunk, inspectProofs);
      await enter('read-remote');
      const remoteIndex = await readIndex(remote, identityKey, remoteSettings.storageIdentityKey, onChunk);
      const diff = diffIndexes(localIndex, remoteIndex);
      record.onlyLocal = diff.onlyLocal;
      record.onlyRemote = diff.onlyRemote;

      if (suspectProofs.length > 0) {
        await enter('check-proofs');
        for (const row of suspectProofs) {
          await repairProof(row.txid, 'preflight', false);
          await onChunk([], 1);
        }
      }

      await enter('check-chain');
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

      const repairRejected = async (rows: ProvenTxRow[], error: unknown) => {
        let repaired = 0;
        for (const row of rows) if (await repairProof(row.txid, 'rejected', true)) repaired++;
        // Nothing could be changed (rows passed the checks here, or their refetch
        // failed): keep what the server said and which rows it was sent.
        if (repaired === 0) {
          (record.rejectedChunks ??= []).push({ message: errorMessage(error), txids: rows.map((r) => r.txid) });
        }
        return repaired;
      };

      // Local into remote first. A proof the server refuses is repaired and
      // resent, and a repaired proof then replaces the remote's copy, so the
      // push into local finds the two identical. The other way round, the local
      // store runs the same check on the remote's unrepaired copy and refuses it.
      await enter('push-to-remote');
      record.pushedToRemote = await push(
        local,
        localSettings,
        remote,
        remoteSettings,
        identityKey,
        true,
        onChunk,
        repairRejected,
      );
      // The local store checks a differing incoming proof against the chain,
      // and a network error there reads as a bad proof: resend (bounded).
      const resendOnly = async () => 1;
      await enter('push-to-local');
      record.pushedToLocal = await push(
        remote,
        remoteSettings,
        local,
        localSettings,
        identityKey,
        true,
        onChunk,
        resendOnly,
      );

      // Proofs only the remote had came in unchecked (a new row is never
      // validated). Repair any the server would refuse now, so they go back
      // out below instead of waiting for another run.
      let proofsRepairedAfterImport = 0;
      for (const txid of diff.onlyRemote.provenTxs) {
        if (await repairProof(txid, 'imported', false)) proofsRepairedAfterImport++;
      }

      await enter('apply-corrections');
      const { user } = await local.findOrInsertUser(identityKey);
      record.corrected = [];
      for (const c of conflicts) {
        if (await applyVerdict(local, user.userId, c.txid, c.vout, c.verdict)) record.corrected.push(c.outpoint);
      }
      if (record.corrected.length > 0 || proofsRepairedAfterImport > 0) {
        await enter('push-corrections');
        record.pushedCorrections = await push(
          local,
          localSettings,
          remote,
          remoteSettings,
          identityKey,
          false,
          onChunk,
          repairRejected,
        );
      }

      const verifyStores = async (): Promise<VerifyResult> => {
        const localAfter = await readIndex(local, identityKey, localSettings.storageIdentityKey, onChunk);
        const remoteAfter = await readIndex(remote, identityKey, remoteSettings.storageIdentityKey, onChunk);
        const after = diffIndexes(localAfter, remoteAfter);
        return {
          onlyLocal: oneSidedCount(after.onlyLocal),
          onlyRemote: oneSidedCount(after.onlyRemote),
          mismatched: conflicts
            .filter((c) => c.verdict.kind !== 'unresolved')
            .filter(
              (c) =>
                !matchesVerdict(localAfter, c.outpoint, c.verdict) ||
                !matchesVerdict(remoteAfter, c.outpoint, c.verdict),
            )
            .map((c) => c.outpoint),
          onlyLocalKeys: after.onlyLocal,
          onlyRemoteKeys: after.onlyRemote,
        };
      };

      await enter('verify');
      record.verify = await verifyStores();
      if (!isSettled(record.verify)) {
        // The sync lock only holds this wallet back; the remote server keeps
        // working on the account (saving a proof, say) while the run is under
        // way. Send what changed since the full passes, then check once more.
        record.firstVerify = record.verify;
        await enter('verify-resync');
        const toRemote = await push(
          local,
          localSettings,
          remote,
          remoteSettings,
          identityKey,
          false,
          onChunk,
          repairRejected,
        );
        const toLocal = await push(
          remote,
          remoteSettings,
          local,
          localSettings,
          identityKey,
          false,
          onChunk,
          resendOnly,
        );
        record.pushedOnResync = { toRemote, toLocal };
        await enter('verify');
        record.verify = await verifyStores();
      }
      // Finished cleanly: the phase and offsets only matter when a run stops partway.
      record.phase = undefined;
      record.phaseItems = undefined;
      record.offsets = undefined;
    });
    return record;
  } catch (error) {
    record.error = errorMessage(error);
    record.errorStack = error instanceof Error ? error.stack : undefined;
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    await saveRecord(record);
    await archiveRecord(record);
  }
};
