import type { sdk } from '@bsv/wallet-toolbox-client';

/**
 * Pure pieces of the local/remote storage reconcile: indexing full sync
 * dumps by natural key, diffing two stores, and deciding spend conflicts
 * from chain answers. I/O lives in storageReconcileBackground.ts.
 */

/** chrome.storage.local key holding the last reconcile run on this device. */
export const RECONCILE_RECORD_KEY = 'storageReconcileLastRun';

type TransactionStatus = sdk.TransactionStatus;

/** Wallet statuses where a spend exists only inside the wallet so far. */
const PENDING_STATUSES: TransactionStatus[] = ['unsigned', 'nosend', 'unprocessed', 'sending', 'nonfinal'];

export interface IndexedOutput {
  outputId: number;
  transactionId: number;
  txid: string;
  vout: number;
  spendable: boolean;
  spentBy?: number;
}

export interface StoreIndex {
  /** transactionId → txid, or `ref:<reference>` for transactions without a txid yet. */
  txKeyById: Map<number, string>;
  txStatusByKey: Map<string, TransactionStatus>;
  /** Keyed by outpoint `txid.vout`. */
  outputs: Map<string, IndexedOutput>;
  provenTxs: Set<string>;
  certificates: Set<string>;
  baskets: Set<string>;
  tags: Set<string>;
  labels: Set<string>;
}

export const SYNC_ENTITIES = [
  ['provenTx', 'provenTxs'],
  ['outputBasket', 'outputBaskets'],
  ['outputTag', 'outputTags'],
  ['txLabel', 'txLabels'],
  ['transaction', 'transactions'],
  ['output', 'outputs'],
  ['txLabelMap', 'txLabelMaps'],
  ['outputTagMap', 'outputTagMaps'],
  ['certificate', 'certificates'],
  ['certificateField', 'certificateFields'],
  ['commission', 'commissions'],
  ['provenTxReq', 'provenTxReqs'],
] as const;

type ChunkArrayKey = (typeof SYNC_ENTITIES)[number][1];

const chunkArray = (chunk: sdk.SyncChunk, key: ChunkArrayKey): unknown[] | undefined =>
  chunk[key] as unknown[] | undefined;

/** A chunk is the last one when every entity was reached and returned nothing. */
export const isFinalChunk = (chunk: sdk.SyncChunk): boolean =>
  SYNC_ENTITIES.every(([, key]) => chunkArray(chunk, key)?.length === 0);

/** Advance paging offsets by what the chunk returned, mirroring EntitySyncState. */
export const advanceOffsets = (offsets: sdk.RequestSyncChunkArgs['offsets'], chunk: sdk.SyncChunk): number => {
  let items = 0;
  SYNC_ENTITIES.forEach(([, key], i) => {
    const n = chunkArray(chunk, key)?.length ?? 0;
    offsets[i].offset += n;
    items += n;
  });
  return items;
};

export const initialOffsets = (): sdk.RequestSyncChunkArgs['offsets'] =>
  SYNC_ENTITIES.map(([name]) => ({ name, offset: 0 }));

export const emptyIndex = (): StoreIndex => ({
  txKeyById: new Map(),
  txStatusByKey: new Map(),
  outputs: new Map(),
  provenTxs: new Set(),
  certificates: new Set(),
  baskets: new Set(),
  tags: new Set(),
  labels: new Set(),
});

export const outpointKey = (txid: string, vout: number): string => `${txid}.${vout}`;

/**
 * getSyncChunk returns every transaction before any output, so an output's
 * transaction is always indexed by the time the output arrives.
 */
export const indexChunk = (index: StoreIndex, chunk: sdk.SyncChunk): void => {
  for (const tx of chunk.transactions ?? []) {
    const key = tx.txid || `ref:${tx.reference}`;
    index.txKeyById.set(tx.transactionId, key);
    index.txStatusByKey.set(key, tx.status);
  }
  for (const o of chunk.outputs ?? []) {
    const txid = o.txid || index.txKeyById.get(o.transactionId);
    if (!txid || txid.startsWith('ref:')) continue;
    index.outputs.set(outpointKey(txid, o.vout), {
      outputId: o.outputId,
      transactionId: o.transactionId,
      txid,
      vout: o.vout,
      spendable: o.spendable,
      spentBy: o.spentBy,
    });
  }
  for (const p of chunk.provenTxs ?? []) index.provenTxs.add(p.txid);
  for (const c of chunk.certificates ?? []) index.certificates.add(`${c.certifier}.${c.serialNumber}`);
  for (const b of chunk.outputBaskets ?? []) index.baskets.add(b.name);
  for (const t of chunk.outputTags ?? []) index.tags.add(t.tag);
  for (const l of chunk.txLabels ?? []) index.labels.add(l.label);
};

/** Key of the transaction spending this output in this store, or null if none. */
export const spenderKey = (index: StoreIndex, o: IndexedOutput): string | null =>
  o.spentBy ? (index.txKeyById.get(o.spentBy) ?? `id:${o.spentBy}`) : null;

export interface OneSided {
  transactions: string[];
  outputs: string[];
  provenTxs: string[];
  certificates: string[];
  baskets: string[];
  tags: string[];
  labels: string[];
}

export interface SpendConflict {
  outpoint: string;
  txid: string;
  vout: number;
  local: string | null;
  remote: string | null;
}

export interface StoreDiff {
  onlyLocal: OneSided;
  onlyRemote: OneSided;
  spendConflicts: SpendConflict[];
}

const minus = <T>(a: Iterable<T>, b: { has: (v: T) => boolean }): T[] => [...a].filter((v) => !b.has(v));

const oneSided = (a: StoreIndex, b: StoreIndex): OneSided => ({
  transactions: minus(a.txStatusByKey.keys(), b.txStatusByKey),
  outputs: minus(a.outputs.keys(), b.outputs),
  provenTxs: minus(a.provenTxs, b.provenTxs),
  certificates: minus(a.certificates, b.certificates),
  baskets: minus(a.baskets, b.baskets),
  tags: minus(a.tags, b.tags),
  labels: minus(a.labels, b.labels),
});

export const oneSidedCount = (s: OneSided): number => Object.values(s).reduce((n, v: string[]) => n + v.length, 0);

/** Outputs both stores hold where at least one records a spend and they disagree on the spender. */
export const diffIndexes = (local: StoreIndex, remote: StoreIndex): StoreDiff => {
  const spendConflicts: SpendConflict[] = [];
  for (const [outpoint, lo] of local.outputs) {
    const ro = remote.outputs.get(outpoint);
    if (!ro) continue;
    const ls = spenderKey(local, lo);
    const rs = spenderKey(remote, ro);
    if (ls === rs) continue;
    spendConflicts.push({ outpoint, txid: lo.txid, vout: lo.vout, local: ls, remote: rs });
  }
  return { onlyLocal: oneSided(local, remote), onlyRemote: oneSided(remote, local), spendConflicts };
};

export type SpendVerdict =
  | { kind: 'spent'; txid: string }
  | { kind: 'unspent' }
  | { kind: 'unresolved'; reason: string };

export type ChainTxStatus = 'mined' | 'known' | 'unknown';

export interface ChainAnswers {
  /** Spending txid per outpoint from the indexer, null when it knows of no spend. */
  spends: Map<string, string | null>;
  statuses: Map<string, ChainTxStatus>;
}

/** Txids whose chain status the verdicts need: every candidate spender and each conflicted output's own tx. */
export const txidsToCheck = (conflicts: SpendConflict[]): string[] => {
  const txids = new Set<string>();
  for (const c of conflicts) {
    txids.add(c.txid);
    for (const s of [c.local, c.remote]) if (s && !s.includes(':')) txids.add(s);
  }
  return [...txids];
};

/**
 * Decide the real spend state of a conflicted output. Only answers backed by
 * the indexer or chain status produce a verdict; anything ambiguous stays
 * unresolved and is left untouched.
 */
export const decideSpend = (
  c: SpendConflict,
  local: StoreIndex,
  remote: StoreIndex,
  chain: ChainAnswers,
): SpendVerdict => {
  const indexed = chain.spends.get(c.outpoint);
  if (indexed) return { kind: 'spent', txid: indexed };

  const spenders = [c.local, c.remote].filter((s): s is string => s !== null);
  for (const s of spenders) {
    const status = local.txStatusByKey.get(s) ?? remote.txStatusByKey.get(s);
    if (s.includes(':') || (status && PENDING_STATUSES.includes(status))) {
      return { kind: 'unresolved', reason: `pending wallet spend ${s}` };
    }
  }

  const mined = spenders.filter((s) => chain.statuses.get(s) === 'mined');
  if (mined.length === 1) return { kind: 'spent', txid: mined[0] };
  if (mined.length > 1) return { kind: 'unresolved', reason: 'both spends reported mined' };
  if (spenders.some((s) => chain.statuses.get(s) === 'known')) {
    return { kind: 'unresolved', reason: 'spend seen on network but not mined or indexed' };
  }
  if (chain.statuses.get(c.txid) === 'mined') return { kind: 'unspent' };
  return { kind: 'unresolved', reason: 'output transaction not confirmed on chain' };
};

/** Whether a store's current state for the outpoint matches the verdict. */
export const matchesVerdict = (index: StoreIndex, outpoint: string, verdict: SpendVerdict): boolean => {
  const o = index.outputs.get(outpoint);
  if (!o || verdict.kind === 'unresolved') return false;
  const spender = spenderKey(index, o);
  if (verdict.kind === 'unspent') return o.spendable && spender === null;
  if (index.txStatusByKey.has(verdict.txid)) return !o.spendable && spender === verdict.txid;
  return !o.spendable && spender === null;
};

export type ReconcileTrigger = 'migration' | 'manual';

export type ReconcilePhase =
  | 'read-local'
  | 'read-remote'
  | 'check-chain'
  | 'push-to-remote'
  | 'push-to-local'
  | 'apply-corrections'
  | 'push-corrections'
  | 'verify';

export interface ReconcileRecord {
  startedAt: string;
  finishedAt?: string;
  trigger: ReconcileTrigger;
  appVersion: string;
  remoteUrl: string;
  /** Phase in progress, or the one that failed once the run has finished with an error. */
  phase?: ReconcilePhase;
  /** Items read or pushed so far in the current phase. */
  phaseItems?: number;
  /** Paging offsets of the last chunk requested in the current phase; on failure, where it stopped. */
  offsets?: Array<{ name: string; offset: number }>;
  localStorageIdentityKey?: string;
  remoteStorageIdentityKey?: string;
  onlyLocal?: OneSided;
  onlyRemote?: OneSided;
  pushedToRemote?: { inserts: number; updates: number };
  pushedToLocal?: { inserts: number; updates: number };
  pushedCorrections?: { inserts: number; updates: number };
  spendConflicts?: Array<SpendConflict & { verdict: SpendVerdict }>;
  corrected?: string[];
  verify?: { onlyLocal: number; onlyRemote: number; mismatched: string[] };
  error?: string;
  errorStack?: string;
  /** Set once the user has dismissed the result of a migration run. */
  acknowledged?: boolean;
}

export type ReconcileOutcome = 'running' | 'clean' | 'differences' | 'failed';

export const reconcileOutcome = (r: ReconcileRecord): ReconcileOutcome => {
  if (!r.finishedAt) return 'running';
  if (r.error) return 'failed';
  const unresolved = r.spendConflicts?.some((c) => c.verdict.kind === 'unresolved') ?? false;
  const v = r.verify;
  return v && v.onlyLocal === 0 && v.onlyRemote === 0 && v.mismatched.length === 0 && !unresolved
    ? 'clean'
    : 'differences';
};
