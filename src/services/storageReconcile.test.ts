import { describe, expect, test } from 'bun:test';
import type { sdk } from '@bsv/wallet-toolbox-client';
import {
  advanceOffsets,
  type ChainAnswers,
  decideSpend,
  diffIndexes,
  emptyIndex,
  indexChunk,
  initialOffsets,
  isFinalChunk,
  matchesVerdict,
  type ReconcileRecord,
  reconcileOutcome,
  type StoreIndex,
} from './storageReconcile';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const tx = (transactionId: number, txid: string, status: sdk.TransactionStatus = 'completed') =>
  ({ transactionId, txid, reference: `r${transactionId}`, status }) as sdk.TableTransaction;

const out = (outputId: number, transactionId: number, txid: string, vout: number, spentBy?: number) =>
  ({ outputId, transactionId, txid, vout, spendable: spentBy === undefined, spentBy }) as sdk.TableOutput;

const index = (chunk: Partial<sdk.SyncChunk>): StoreIndex => {
  const i = emptyIndex();
  indexChunk(i, chunk as sdk.SyncChunk);
  return i;
};

const chain = (spends: Record<string, string | null>, statuses: Record<string, 'mined' | 'known' | 'unknown'>) =>
  ({ spends: new Map(Object.entries(spends)), statuses: new Map(Object.entries(statuses)) }) as ChainAnswers;

describe('paging', () => {
  test('final only when every entity was reached and empty', () => {
    const empty = Object.fromEntries(
      [
        'provenTxs',
        'outputBaskets',
        'outputTags',
        'txLabels',
        'transactions',
        'outputs',
        'txLabelMaps',
        'outputTagMaps',
        'certificates',
        'certificateFields',
        'commissions',
        'provenTxReqs',
      ].map((k) => [k, []]),
    ) as unknown as sdk.SyncChunk;
    expect(isFinalChunk(empty)).toBe(true);
    expect(isFinalChunk({ ...empty, commissions: undefined })).toBe(false);
  });

  test('offsets advance per entity', () => {
    const offsets = initialOffsets();
    const n = advanceOffsets(offsets, {
      transactions: [tx(1, A), tx(2, B)],
      outputs: [out(1, 1, A, 0)],
    } as sdk.SyncChunk);
    expect(n).toBe(3);
    expect(offsets.find((o) => o.name === 'transaction')?.offset).toBe(2);
    expect(offsets.find((o) => o.name === 'output')?.offset).toBe(1);
  });
});

describe('diffIndexes', () => {
  test('finds records held by only one store, matching by txid across different ids', () => {
    const local = index({ transactions: [tx(1, A), tx(2, B)], outputs: [out(10, 1, A, 0)] });
    const remote = index({ transactions: [tx(7, A)], outputs: [out(70, 7, A, 0), out(71, 7, A, 1)] });
    const d = diffIndexes(local, remote);
    expect(d.onlyLocal.transactions).toEqual([B]);
    expect(d.onlyRemote.outputs).toEqual([`${A}.1`]);
    expect(d.spendConflicts).toEqual([]);
  });

  test('reports outputs spent by different transactions in each store', () => {
    const local = index({ transactions: [tx(1, A), tx(2, B)], outputs: [out(10, 1, A, 0, 2)] });
    const remote = index({ transactions: [tx(5, A), tx(6, C)], outputs: [out(50, 5, A, 0, 6)] });
    expect(diffIndexes(local, remote).spendConflicts).toEqual([
      { outpoint: `${A}.0`, txid: A, vout: 0, local: B, remote: C },
    ]);
  });

  test('reports a spend recorded on one side only', () => {
    const local = index({ transactions: [tx(1, A), tx(2, B)], outputs: [out(10, 1, A, 0, 2)] });
    const remote = index({ transactions: [tx(5, A)], outputs: [out(50, 5, A, 0)] });
    expect(diffIndexes(local, remote).spendConflicts[0]).toMatchObject({ local: B, remote: null });
  });
});

describe('decideSpend', () => {
  const local = index({ transactions: [tx(1, A), tx(2, B)], outputs: [out(10, 1, A, 0, 2)] });
  const remote = index({ transactions: [tx(5, A), tx(6, C)], outputs: [out(50, 5, A, 0, 6)] });
  const conflict = diffIndexes(local, remote).spendConflicts[0];

  test('indexer spend wins', () => {
    expect(decideSpend(conflict, local, remote, chain({ [`${A}.0`]: C }, {}))).toEqual({ kind: 'spent', txid: C });
  });

  test('single mined candidate wins when the indexer has no spend', () => {
    expect(decideSpend(conflict, local, remote, chain({}, { [B]: 'mined', [C]: 'unknown' }))).toEqual({
      kind: 'spent',
      txid: B,
    });
  });

  test('unmined candidates with a mined output leave it unspent', () => {
    expect(decideSpend(conflict, local, remote, chain({}, { [A]: 'mined', [B]: 'unknown', [C]: 'unknown' }))).toEqual({
      kind: 'unspent',
    });
  });

  test('a candidate seen on the network stays unresolved', () => {
    expect(decideSpend(conflict, local, remote, chain({}, { [A]: 'mined', [B]: 'known' })).kind).toBe('unresolved');
  });

  test('a pending wallet spend stays unresolved', () => {
    const pending = index({ transactions: [tx(1, A), tx(2, B, 'nosend')], outputs: [out(10, 1, A, 0, 2)] });
    const c = diffIndexes(pending, remote).spendConflicts[0];
    expect(decideSpend(c, pending, remote, chain({}, { [A]: 'mined' })).kind).toBe('unresolved');
  });

  test('an unconfirmed output stays unresolved', () => {
    expect(decideSpend(conflict, local, remote, chain({}, { [A]: 'unknown' })).kind).toBe('unresolved');
  });
});

describe('matchesVerdict', () => {
  const store = index({ transactions: [tx(1, A), tx(2, B)], outputs: [out(10, 1, A, 0, 2), out(11, 1, A, 1)] });

  test('spent by a stored transaction', () => {
    expect(matchesVerdict(store, `${A}.0`, { kind: 'spent', txid: B })).toBe(true);
    expect(matchesVerdict(store, `${A}.0`, { kind: 'spent', txid: C })).toBe(false);
  });

  test('unspent', () => {
    expect(matchesVerdict(store, `${A}.1`, { kind: 'unspent' })).toBe(true);
    expect(matchesVerdict(store, `${A}.0`, { kind: 'unspent' })).toBe(false);
  });
});

describe('reconcileOutcome', () => {
  const base: ReconcileRecord = {
    startedAt: '2026-10-02T00:00:00.000Z',
    trigger: 'migration',
    appVersion: '5.1.0',
    remoteUrl: 'https://wallet.1sat.app',
  };
  const finished = { ...base, finishedAt: '2026-10-02T00:01:00.000Z' };
  const verified = { onlyLocal: 0, onlyRemote: 0, mismatched: [] };

  test('running until finished', () => {
    expect(reconcileOutcome(base)).toBe('running');
  });

  test('failed when an error was recorded', () => {
    expect(reconcileOutcome({ ...finished, error: 'boom', verify: verified })).toBe('failed');
  });

  test('clean only when verified with nothing unresolved', () => {
    expect(reconcileOutcome({ ...finished, verify: verified, spendConflicts: [] })).toBe('clean');
    expect(reconcileOutcome({ ...finished, verify: { ...verified, onlyRemote: 1 } })).toBe('differences');
    expect(
      reconcileOutcome({
        ...finished,
        verify: verified,
        spendConflicts: [
          {
            outpoint: `${A}.0`,
            txid: A,
            vout: 0,
            local: B,
            remote: null,
            verdict: { kind: 'unresolved', reason: 'x' },
          },
        ],
      }),
    ).toBe('differences');
  });

  test('a finished run without a verify step is not clean', () => {
    expect(reconcileOutcome(finished)).toBe('differences');
  });
});
