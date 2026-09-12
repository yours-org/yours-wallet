/** Offline import regressions. No live wallet, real key access, signing or broadcast. */
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
import { prepareSweepInputs, sweepBsv, sweepOrdinals, type OneSatContext } from '@1sat/actions';
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';
import { scanAddress, type ScannedAssets } from '../src/sweep/scanner';
import { importedKeyMap, keysForPreparedInputs, sweepImportedAssets } from '../src/sweep/imported';
import type { SweepSelection, SweepTxResult } from '../src/sweep/types';

const keys = [1, 2, 3].map((value) => PrivateKey.fromString(value.toString(16), 'hex'));
const addresses = keys.map((key) => key.toPublicKey().toAddress());
const keyMap = importedKeyMap({ walletWif: keys[0].toWif(), ordWif: keys[1].toWif(), identityWif: keys[2].toWif() });
const selection: SweepSelection = { sweepBsv: true, selectedOrdinals: new Set(), selectedBsv21TokenIds: new Set() };
const emptyAssets = (): ScannedAssets => ({
  funding: [],
  ordinals: [],
  opnsNames: [],
  listings: [],
  bsv21Tokens: [],
  bsv20Tokens: [],
  locked: [],
  run: [],
  totalBsv: 0,
});
const txA = new Transaction();
txA.addOutput({ lockingScript: new P2PKH().lock(addresses[0]), satoshis: 1 });
txA.addOutput({ lockingScript: new P2PKH().lock(addresses[2]), satoshis: 1 });
const txB = new Transaction();
txB.addOutput({ lockingScript: new P2PKH().lock(addresses[1]), satoshis: 100 });
const row = (tx: Transaction, vout: number, owner: string): IndexedOutput => ({
  outpoint: `${tx.id('hex')}.${vout}`,
  satoshis: tx.outputs[vout].satoshis,
  score: 0,
  events: [`own:${owner}`],
});
const mixed = [row(txA, 0, addresses[0]), row(txB, 0, addresses[1]), row(txA, 1, addresses[2])];
const context = {
  wallet: { getPublicKey: async () => ({ publicKey: 'offline-account' }) },
  services: {
    getBeefForTxid: async (txid: string) => ({ findTxid: () => ({ tx: txid === txA.id('hex') ? txA : txB }) }),
  },
} as unknown as OneSatContext;

afterEach(() => mock.restoreAll());

function run(
  assets: ScannedAssets,
  selected = selection,
  completed = new Set<string>(),
  signal = new AbortController().signal,
) {
  const results: SweepTxResult[] = [];
  return {
    results,
    completed,
    promise: sweepImportedAssets(context, assets, keyMap, selected, {
      signal,
      completed,
      onProgress() {},
      onResult: (result) => results.push(result),
    }),
  };
}

test('native scanner requests OrdLock metadata and preserves listings without public listing events', async () => {
  let searches = 0;
  const listing = { ...mixed[0], data: { ordlock: { price: 0 } } };
  const services = {
    owner: {
      async *getTxos(_address: string, options: unknown) {
        assert.deepEqual(options, { refresh: true, limit: 1 });
        yield { type: 'done' };
      },
    },
    txo: {
      search: async (_owner: string, options: unknown) => {
        searches++;
        assert.deepEqual(options, { unspent: true, events: true, tags: ['ordlock'], sats: true, limit: 0 });
        return [listing];
      },
    },
  } as unknown as OneSatServices;
  const result = await scanAddress(services, addresses[0]);
  assert.equal(searches, 1);
  assert.equal(result.listings.length, 1);
  assert.deepEqual(result.listings[0].events, listing.events);
  assert.equal(result.ordinals.length, 0);
  assert.equal(result.funding.length, 0);
});

test('native scanner rejects SSE error and incomplete EOF before querying any assets', async () => {
  for (const error of [false, true]) {
    let searches = 0;
    const services = {
      owner: {
        async *getTxos() {
          if (error) yield { type: 'error', error: new Error('offline failure') };
        },
      },
      txo: {
        search: async () => {
          searches++;
          return [];
        },
      },
    } as unknown as OneSatServices;
    await assert.rejects(scanAddress(services, addresses[0]));
    assert.equal(searches, 0);
  }
});

test('owner keys align with native prepared input outpoints after transaction grouping', async () => {
  const prepared = await prepareSweepInputs(context, mixed);
  assert.deepEqual(
    prepared.map((input) => input.outpoint),
    [mixed[0].outpoint, mixed[2].outpoint, mixed[1].outpoint],
  );
  assert.deepEqual(
    keysForPreparedInputs(prepared, mixed, keyMap).map((key) => key.toPublicKey().toAddress()),
    [addresses[0], addresses[2], addresses[1]],
  );
});

test('imported token listings are not swept as ordinals', async () => {
  const cancellation = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'unexpected' }));
  const listed = {
    ...mixed[0],
    events: [...(mixed[0].events ?? []), 'type:application/bsv-20'],
    data: { insc: { file: { type: 'application/bsv-20' }, json: { p: 'bsv-20' } } },
  };
  const task = run({ ...emptyAssets(), listings: [listed] }, { ...selection, sweepBsv: false });
  await task.promise;
  assert.equal(cancellation.mock.callCount(), 0);
  assert.match(task.results[0].error ?? '', /transfer inscription/);
});

test('listing-only imports are cancelled with the proper pay, ord and identity keys', async () => {
  const cancellation = mock.method(sweepOrdinals, 'execute', async (_ctx, input) => {
    assert.deepEqual(
      input.keys.map((key) => key.toPublicKey().toAddress()),
      [addresses[0], addresses[2], addresses[1]],
    );
    return { txid: 'listing-receipt' };
  });
  const funding = mock.method(sweepBsv, 'execute', async () => {
    throw new Error('funding must not run');
  });
  const task = run({ ...emptyAssets(), listings: mixed }, { ...selection, sweepBsv: false });
  await task.promise;
  assert.equal(cancellation.mock.callCount(), 1);
  assert.equal(funding.mock.callCount(), 0);
  assert.equal(task.results[0].txid, 'listing-receipt');
  assert.equal(task.completed.size, 3);
});

test('missing imported owner cannot invoke cancellation or funding', async () => {
  const cancellation = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'unexpected' }));
  const funding = mock.method(sweepBsv, 'execute', async () => ({ txid: 'unexpected' }));
  const task = run({ ...emptyAssets(), listings: [{ ...mixed[0], events: [] }], funding: [mixed[1]] });
  await task.promise;
  assert.equal(cancellation.mock.callCount(), 0);
  assert.equal(funding.mock.callCount(), 0);
  assert.match(task.results[0].error!, /Cannot match imported owner/);
});

test('listing error or missing txid blocks every funding operation', async () => {
  for (const response of [{ error: 'retry' }, {}, { txid: '  ' }]) {
    mock.restoreAll();
    mock.method(sweepOrdinals, 'execute', async () => response);
    const funding = mock.method(sweepBsv, 'execute', async () => ({ txid: 'unexpected' }));
    const task = run({ ...emptyAssets(), listings: [mixed[0]], funding: [mixed[1]] });
    await task.promise;
    assert.equal(funding.mock.callCount(), 0);
    assert.ok(task.results[0].error);
    assert.equal(task.completed.size, 0);
  }
});

test('successful cancellation survives funding failure and retry never repeats completed inputs', async () => {
  const cancellation = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'listing-receipt' }));
  const funding = mock.method(sweepBsv, 'execute', async (_ctx, input) => {
    assert.equal(input.keys[0].toPublicKey().toAddress(), addresses[1]);
    return { error: 'funding failure' };
  });
  const assets = { ...emptyAssets(), listings: [mixed[0]], funding: [mixed[1]] };
  const task = run(assets);
  await task.promise;
  assert.equal(task.results[0].txid, 'listing-receipt');
  assert.equal(task.results[1].error, 'funding failure');
  funding.mock.mockImplementation(async () => ({ txid: 'funding-receipt' }));
  const retry = run(assets, selection, task.completed);
  await retry.promise;
  assert.equal(cancellation.mock.callCount(), 1);
  assert.equal(funding.mock.callCount(), 2);
  assert.equal(retry.results[0].txid, 'funding-receipt');
});

test('abort after an accepted listing transaction retains its receipt and stops funding', async () => {
  const controller = new AbortController();
  mock.method(sweepOrdinals, 'execute', async () => {
    controller.abort();
    return { txid: 'listing-receipt' };
  });
  const funding = mock.method(sweepBsv, 'execute', async () => ({ txid: 'unexpected' }));
  const task = run(
    { ...emptyAssets(), listings: [mixed[0]], funding: [mixed[1]] },
    selection,
    new Set(),
    controller.signal,
  );
  await assert.rejects(task.promise);
  assert.equal(task.results[0].txid, 'listing-receipt');
  assert.equal(funding.mock.callCount(), 0);
});

test('selected OpNS outputs use native ordinal sweep and their actual owner key', async () => {
  const action = mock.method(sweepOrdinals, 'execute', async (_ctx, input) => {
    assert.equal(input.keys[0].toPublicKey().toAddress(), addresses[2]);
    return { txid: 'opns-receipt' };
  });
  const task = run(
    { ...emptyAssets(), opnsNames: [mixed[2]] },
    { ...selection, sweepBsv: false, selectedOrdinals: new Set([mixed[2].outpoint]) },
  );
  await task.promise;
  assert.equal(action.mock.callCount(), 1);
  assert.equal(task.results[0].txid, 'opns-receipt');
});

test('ambiguous imported ownership fails closed before native execution', async () => {
  const input = await prepareSweepInputs(context, [mixed[0]]);
  assert.throws(
    () =>
      keysForPreparedInputs(input, [{ ...mixed[0], events: [`own:${addresses[0]}`, `own:${addresses[1]}`] }], keyMap),
    /Cannot match imported owner/,
  );
});

test('more than 25 imported listings cancel in sequential batches and retry only unfinished batches', async () => {
  const tx = new Transaction();
  for (let i = 0; i < 57; i++) tx.addOutput({ lockingScript: new P2PKH().lock(addresses[i % 3]), satoshis: 1 });
  const listings = tx.outputs.map((_, i) => row(tx, i, addresses[i % 3]));
  mock.method(context.services, 'getBeefForTxid', async (txid: string) => ({
    findTxid: () => ({ tx: txid === tx.id('hex') ? tx : txB }),
  }));
  const sizes: number[] = [];
  let fail = true;
  mock.method(sweepOrdinals, 'execute', async (_ctx, input) => {
    sizes.push(input.inputs.length);
    assert.ok(input.inputs.length <= 25);
    for (let i = 0; i < input.inputs.length; i++) {
      const vout = Number(input.inputs[i].outpoint.split('.')[1]);
      assert.equal(input.keys[i].toPublicKey().toAddress(), addresses[vout % 3]);
    }
    return fail && sizes.length === 2 ? { error: 'batch retry' } : { txid: `batch-${sizes.length}` };
  });
  const funding = mock.method(sweepBsv, 'execute', async () => ({ txid: 'funding-receipt' }));
  const assets = { ...emptyAssets(), listings, funding: [mixed[1]] };
  const first = run(assets);
  await first.promise;
  assert.deepEqual(sizes, [25, 25]);
  assert.equal(first.completed.size, 25);
  assert.equal(first.results[0].txid, 'batch-1');
  assert.equal(first.results[1].error, 'batch retry');
  assert.equal(funding.mock.callCount(), 0);
  fail = false;
  const retry = run(assets, selection, first.completed);
  await retry.promise;
  assert.deepEqual(sizes, [25, 25, 25, 7]);
  assert.equal(retry.completed.size, 58);
  assert.equal(funding.mock.callCount(), 1);
});
