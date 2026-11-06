import { describe, expect, test } from 'bun:test';
import { sdk } from '@bsv/wallet-toolbox-client';
import { OneColor } from '@1sat/templates';
import { LockingScript, type ActionStatus, type WalletInterface } from '@bsv/sdk';
import {
  aggregateOneColorHoldings,
  listOneColorHoldings,
  assetInfoFromMetadata,
  findSpendingStatuses,
  normalizeHandle,
  oneColorActionAmount,
  pendingAmount,
} from './oneColor';

const ASSET = `${'ab'.repeat(32)}_0`;
const OTHER = `${'cd'.repeat(32)}_0`;
const pkh = new Array(20).fill(7);
const DEPLOY_TXID = 'ab'.repeat(32);
const value = (assetId: string, amount: bigint) => OneColor.value(assetId, amount, { lock: pkh }).lock().toHex();
const authority = (assetId: string) => OneColor.authority(assetId, { lock: pkh }).lock().toHex();

describe('aggregateOneColorHoldings', () => {
  test('sums available value by asset, lists reserved outputs, and counts authorities', () => {
    const held = aggregateOneColorHoldings([
      { outpoint: 'a.0', lockingScript: value(ASSET, 100n), tags: ['p color', 'color_state_available'] },
      { outpoint: 'b.0', lockingScript: value(ASSET, 25n), tags: ['p color', 'color_state_reserved'] },
      { outpoint: 'c.0', lockingScript: value(ASSET, 5n), tags: ['color_state_available'] },
      { outpoint: 'd.0', lockingScript: authority(ASSET), tags: ['color_state_available'] },
      { outpoint: 'e.0', lockingScript: value(OTHER, 1n), tags: ['color_state_available'] },
    ]);
    expect(held.get(ASSET)).toEqual({
      assetId: ASSET,
      available: 105n,
      reservedOutputs: [{ outpoint: 'b.0', amount: 25n }],
      authorities: 1,
    });
    expect(held.get(OTHER)).toEqual({ assetId: OTHER, available: 1n, reservedOutputs: [], authorities: 0 });
  });

  test("a fixed-supply deploy is the asset's first value output, keyed <txid>_0", () => {
    const deploy = OneColor.deployValue(10n, { lock: pkh }).lock().toHex();
    const held = aggregateOneColorHoldings([
      { outpoint: `${DEPLOY_TXID}.0`, lockingScript: deploy, tags: ['color_state_available'] },
      { outpoint: 'b.0', lockingScript: value(`${DEPLOY_TXID}_0`, 5n), tags: ['color_state_available'] },
    ]);
    expect(held.get(`${DEPLOY_TXID}_0`)).toEqual({
      assetId: `${DEPLOY_TXID}_0`,
      available: 15n,
      reservedOutputs: [],
      authorities: 0,
    });
  });

  test("an authority deploy counts as the asset's first authority", () => {
    const deploy = OneColor.deployAuthority({ lock: pkh }).lock().toHex();
    const held = aggregateOneColorHoldings([{ outpoint: `${DEPLOY_TXID}.0`, lockingScript: deploy, tags: [] }]);
    expect(held.get(`${DEPLOY_TXID}_0`)).toEqual({
      assetId: `${DEPLOY_TXID}_0`,
      available: 0n,
      reservedOutputs: [],
      authorities: 1,
    });
  });

  test('skips outputs that are not 1Color outputs', () => {
    const held = aggregateOneColorHoldings([
      { outpoint: 'b.0', lockingScript: '76a914' + '00'.repeat(20) + '88ac', tags: [] },
      { outpoint: 'c.0', lockingScript: 'zz', tags: [] },
      { outpoint: 'd.0', tags: [] },
    ]);
    expect(held.size).toBe(0);
  });
});

describe('listOneColorHoldings', () => {
  test('reads the basket-prefix listing in full pages and tags reserved outputs by spendability', async () => {
    const calls: unknown[] = [];
    const all = Array.from({ length: 1203 }, (_, i) => ({
      outpoint: `${i.toString(16).padStart(64, '0')}.0`,
      satoshis: 1,
      spendable: i % 7 !== 0,
      lockingScript: value(`${DEPLOY_TXID}_0`, 1n),
      tags: ['p color'],
    }));
    const wallet = {
      listOutputs: async (args: { basket: string; tags?: string[]; limit?: number; offset?: number }) => {
        calls.push(args);
        const start = args.offset ?? 0;
        return { totalOutputs: all.length, outputs: all.slice(start, start + (args.limit ?? 10)) };
      },
    };
    const held = await listOneColorHoldings(wallet as never);
    expect(calls.length).toBe(2);
    expect(calls[0]).toMatchObject({
      basket: sdk.specOpBasketPrefixOutputs,
      tags: ['p color'],
      limit: 1000,
      offset: 0,
    });
    expect(held.length).toBe(1203);
    expect(held[0].tags).toEqual(['p color', 'color_state_reserved']);
    expect(held[1].tags).toEqual(['p color', 'color_state_available']);
  });
});

describe('assetInfoFromMetadata', () => {
  test('no metadata: zero decimals, nothing else', () => {
    expect(assetInfoFromMetadata(undefined)).toEqual({ dec: 0 });
  });

  test('symbol, decimals and an image icon as a data URL', () => {
    const info = assetInfoFromMetadata({
      sym: 'TKN',
      dec: 2,
      icon: { mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    });
    expect(info).toEqual({ sym: 'TKN', dec: 2, icon: 'data:image/png;base64,AQID' });
  });

  test('a non-image icon is left out', () => {
    const info = assetInfoFromMetadata({ icon: { mediaType: 'text/plain', bytes: new Uint8Array([1]) } });
    expect(info).toEqual({ dec: 0 });
  });
});

describe('normalizeHandle', () => {
  test('accepts with or without the leading @ and trims', () => {
    expect(normalizeHandle('alice@testnet.1sat.app')).toBe('@alice@testnet.1sat.app');
    expect(normalizeHandle('  @alice@testnet.1sat.app ')).toBe('@alice@testnet.1sat.app');
  });
  test('rejects addresses and malformed input', () => {
    expect(normalizeHandle('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBeNull();
    expect(normalizeHandle('@alice')).toBeNull();
    expect(normalizeHandle('@a@b@c')).toBeNull();
    expect(normalizeHandle('')).toBeNull();
  });
});

describe('reserved outputs: pending versus spent', () => {
  type Spend = { txid: string; status: ActionStatus; inputs: string[] };
  /** A wallet whose history is `spends`, oldest first, answering the newest-first paging. */
  const walletWith = (spends: Spend[], pageLog: number[] = []) =>
    ({
      listActions: async (args: { limit?: number; offset?: number; includeInputs?: boolean }) => {
        const offset = args.offset ?? 0;
        const limit = args.limit ?? 10;
        pageLog.push(limit);
        return {
          totalActions: spends.length,
          actions: spends.slice(offset, offset + limit).map((s) => ({
            txid: s.txid,
            satoshis: 0,
            status: s.status,
            isOutgoing: true,
            description: '',
            version: 1,
            lockTime: 0,
            inputs: args.includeInputs
              ? s.inputs.map((o) => ({ sourceOutpoint: o, sourceSatoshis: 1, inputDescription: '', sequenceNumber: 0 }))
              : undefined,
          })),
        };
      },
    }) as unknown as Pick<WalletInterface, 'listActions'>;

  test('a handoff input is pending; the input of a broadcast split is spent; an unknown one is pending', async () => {
    const wallet = walletWith([
      { txid: 'old', status: 'completed', inputs: ['x.0'] },
      { txid: 'split', status: 'unproven', inputs: ['big.0'] },
      { txid: 'handoff', status: 'nosend', inputs: ['split.0'] },
    ]);
    const reserved = [
      { outpoint: 'big.0', amount: 10_000n },
      { outpoint: 'split.0', amount: 1_000n },
      { outpoint: 'older.0', amount: 7n },
    ];
    const statuses = await findSpendingStatuses(
      wallet,
      reserved.map((r) => r.outpoint),
    );
    expect(statuses.get('big.0')).toBe('unproven');
    expect(statuses.get('split.0')).toBe('nosend');
    expect(statuses.has('older.0')).toBe(false);
    expect(pendingAmount(reserved, statuses)).toBe(1_007n);
  });

  test('scans newest first and stops once every outpoint is found', async () => {
    const spends: Spend[] = [];
    for (let i = 0; i < 250; i++) spends.push({ txid: `t${i}`, status: 'completed', inputs: [`t${i}.0`] });
    spends.push({ txid: 'h', status: 'nosend', inputs: ['want.0'] });
    const pages: number[] = [];
    const statuses = await findSpendingStatuses(walletWith(spends, pages), ['want.0']);
    expect(statuses.get('want.0')).toBe('nosend');
    // One probe of 1, then a single page of 100 from the newest end.
    expect(pages).toEqual([1, 100]);
  });

  test('nothing reserved means no history read at all', async () => {
    const pages: number[] = [];
    expect((await findSpendingStatuses(walletWith([], pages), [])).size).toBe(0);
    expect(pages).toEqual([]);
  });
});

describe('oneColorActionAmount', () => {
  const TXID = 'ef'.repeat(32);
  const base = {
    txid: TXID,
    satoshis: 0,
    status: 'completed' as const,
    isOutgoing: true,
    description: '',
    version: 1,
    lockTime: 0,
  };
  const out = (lockingScript: string, outputIndex: number, basket?: string) => ({
    lockingScript,
    outputIndex,
    satoshis: 1,
    spendable: true,
    tags: [],
    outputDescription: '',
    basket,
  });
  const inp = (sourceLockingScript: string) => ({
    sourceOutpoint: `${TXID}.0`,
    sourceSatoshis: 1,
    sourceLockingScript,
    inputDescription: '',
    sequenceNumber: 0,
  });

  test('a send: the value output that is not ours is the amount', () => {
    const r = oneColorActionAmount(
      {
        ...base,
        inputs: [inp(value(ASSET, 100n))],
        outputs: [out(value(ASSET, 60n), 0), out(value(ASSET, 40n), 1, 'p color abc')],
      },
      ASSET,
    );
    expect(r).toEqual({ direction: 'sent', amount: 60n });
  });

  test('a receive: value filed into our p color basket, no inputs', () => {
    const r = oneColorActionAmount(
      { ...base, isOutgoing: false, outputs: [out(value(ASSET, 7n), 0, 'p color abc')] },
      ASSET,
    );
    expect(r).toEqual({ direction: 'received', amount: 7n });
  });

  test('a deploy at this action counts as the asset arriving', () => {
    const deploy = OneColor.deployValue(1000n, { lock: pkh }).lock().toHex();
    const r = oneColorActionAmount({ ...base, outputs: [out(deploy, 0, 'p color abc')] }, `${TXID}_0`);
    expect(r).toEqual({ direction: 'received', amount: 1000n });
  });

  test('another asset, or no token outputs at all: null', () => {
    expect(oneColorActionAmount({ ...base, outputs: [out(value(OTHER, 1n), 0)] }, ASSET)).toBeNull();
    expect(oneColorActionAmount({ ...base, outputs: [out('76a914' + '00'.repeat(20) + '88ac', 0)] }, ASSET)).toBeNull();
  });

  test('inputs and outputs that net to nothing we can name: a transfer', () => {
    const r = oneColorActionAmount(
      { ...base, inputs: [inp(value(ASSET, 10n))], outputs: [out(value(ASSET, 10n), 0, 'p color abc')] },
      ASSET,
    );
    expect(r).toEqual({ direction: 'transfer', amount: 0n });
  });

  // An AMM pool: a 1Color value output whose lock is a covenant, not P2PKH.
  const covenant = LockingScript.fromHex('6a28' + 'ab'.repeat(40)); // OP_RETURN <state>
  const pool = (amount: bigint) => OneColor.value(ASSET, amount, { lock: covenant }).lock().toHex();

  test('an LP close: the pool input is not ours, the tokens that come to us are received', () => {
    const r = oneColorActionAmount(
      { ...base, inputs: [inp(pool(5000n))], outputs: [out(value(ASSET, 5000n), 0, 'p color abc')] },
      ASSET,
    );
    expect(r).toEqual({ direction: 'received', amount: 5000n });
  });

  test('a pool deploy: our tokens go into the pool, so they are sent', () => {
    const r = oneColorActionAmount(
      {
        ...base,
        inputs: [inp(value(ASSET, 6000n))],
        outputs: [out(pool(5000n), 0), out(value(ASSET, 1000n), 1, 'p color abc')],
      },
      ASSET,
    );
    expect(r).toEqual({ direction: 'sent', amount: 5000n });
  });

  test('a swap that buys tokens: the pool continues with less and we receive the difference', () => {
    const r = oneColorActionAmount(
      {
        ...base,
        inputs: [inp(pool(5000n))],
        outputs: [out(pool(4000n), 0), out(value(ASSET, 1000n), 1, 'p color abc')],
      },
      ASSET,
    );
    expect(r).toEqual({ direction: 'received', amount: 1000n });
  });

  test('a swap that sells tokens: ours go in, the pool continues with more, change comes back', () => {
    const r = oneColorActionAmount(
      {
        ...base,
        inputs: [inp(pool(4000n)), inp(value(ASSET, 1500n))],
        outputs: [out(pool(5000n), 0), out(value(ASSET, 500n), 1, 'p color abc')],
      },
      ASSET,
    );
    expect(r).toEqual({ direction: 'sent', amount: 1000n });
  });
});
