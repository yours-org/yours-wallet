import { describe, expect, test } from 'bun:test';
import type { sdk } from '@bsv/wallet-toolbox-client';
import { coalesceSyncChunks, countChunkRows } from './usbBackupCoalesce';

const header = { fromStorageIdentityKey: 'from', toStorageIdentityKey: 'to', userIdentityKey: 'user' };
const chunk = (parts: Partial<sdk.SyncChunk>): sdk.SyncChunk => ({ ...header, ...parts }) as sdk.SyncChunk;
const at = (iso: string) => new Date(iso);

describe('coalesceSyncChunks', () => {
  test('a child captured before its parent comes out after it', () => {
    // Pass 1 saw output 9 (its transaction landed between the transaction and output pages);
    // pass 2 then captured transaction 5.
    const chunks = [
      chunk({ outputs: [{ outputId: 9, transactionId: 5, vout: 0, updated_at: at('2026-09-01T00:00:00Z') }] as never }),
      chunk({ transactions: [{ transactionId: 5, updated_at: at('2026-09-01T00:00:01Z') }] as never }),
    ];
    const out = coalesceSyncChunks(chunks);
    expect(out).toHaveLength(1);
    expect(out[0].transactions?.map((t) => t.transactionId)).toEqual([5]);
    expect(out[0].outputs?.map((o) => o.outputId)).toEqual([9]);
    // Transactions precede outputs in the emitted chunk.
    expect(Object.keys(out[0]).indexOf('transactions')).toBeLessThan(Object.keys(out[0]).indexOf('outputs'));
  });

  test('one row per id: the newest updated_at wins, a tie goes to the later chunk', () => {
    const chunks = [
      chunk({
        provenTxReqs: [
          { provenTxReqId: 1, status: 'unsent', updated_at: at('2026-09-01T00:00:00Z') },
          { provenTxReqId: 2, status: 'unsent', updated_at: at('2026-09-01T00:00:00Z') },
        ] as never,
      }),
      chunk({
        provenTxReqs: [
          { provenTxReqId: 1, status: 'completed', updated_at: at('2026-09-02T00:00:00Z') },
          { provenTxReqId: 2, status: 'later-same-time', updated_at: at('2026-09-01T00:00:00Z') },
        ] as never,
      }),
      chunk({
        // An older capture that turns up later does not win.
        provenTxReqs: [{ provenTxReqId: 1, status: 'stale', updated_at: at('2026-08-01T00:00:00Z') }] as never,
      }),
    ];
    const [out] = coalesceSyncChunks(chunks);
    const reqs = out.provenTxReqs as Array<{ provenTxReqId: number; status: string }>;
    expect(reqs.map((r) => [r.provenTxReqId, r.status])).toEqual([
      [1, 'completed'],
      [2, 'later-same-time'],
    ]);
  });

  test('splits into chunks of at most N rows, parents first, and keeps the header and user', () => {
    const transactions = Array.from({ length: 7 }, (_, i) => ({
      transactionId: i + 1,
      updated_at: at('2026-09-01T00:00:00Z'),
    }));
    const outputs = Array.from({ length: 5 }, (_, i) => ({ outputId: i + 1, transactionId: 1, vout: i }));
    const user = { userId: 1, identityKey: 'user' } as never;
    const chunks = [chunk({ outputs: outputs as never }), chunk({ transactions: transactions as never, user })];
    const out = coalesceSyncChunks(chunks, 4);
    expect(out.map(countChunkRows)).toEqual([4, 4, 4]);
    expect(out[0].transactions?.length).toBe(4);
    expect(out[1].transactions?.length).toBe(3);
    expect(out[1].outputs?.length).toBe(1);
    expect(out[2].outputs?.length).toBe(4);
    expect(out[0].user).toBe(user);
    expect(out[1].user).toBeUndefined();
    for (const c of out) expect(c.fromStorageIdentityKey).toBe('from');
  });

  test('composite keys for map tables; empty input gives no chunks; no rows gives one empty chunk', () => {
    const chunks = [
      chunk({ txLabelMaps: [{ txLabelId: 1, transactionId: 2, isDeleted: false }] as never }),
      chunk({
        txLabelMaps: [
          { txLabelId: 1, transactionId: 2, isDeleted: true },
          { txLabelId: 1, transactionId: 3 },
        ] as never,
      }),
    ];
    const [out] = coalesceSyncChunks(chunks);
    expect(out.txLabelMaps).toEqual([
      { txLabelId: 1, transactionId: 2, isDeleted: true },
      { txLabelId: 1, transactionId: 3 },
    ] as never);
    expect(coalesceSyncChunks([])).toEqual([]);
    expect(coalesceSyncChunks([chunk({})])).toEqual([chunk({})]);
  });
});
