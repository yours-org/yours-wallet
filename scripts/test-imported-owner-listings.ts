/** Offline import regressions. No live wallet, real key access, signing or broadcast. */
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
import { prepareSweepInputs, sweepBsv, sweepBsv20, sweepOrdinals, type OneSatContext } from '@1sat/actions';
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';
import { scanAddress, type ScannedAssets } from '../src/sweep/scanner';
import { importedKeyMap, keysForPreparedInputs, sweepImportedAssets } from '../src/sweep/imported';
import type { SweepSelection, SweepTxResult } from '../src/sweep/types';

const keys = [1, 2, 3].map((value) => PrivateKey.fromString(value.toString(16), 'hex'));
const addresses = keys.map((key) => key.toPublicKey().toAddress());
const keyMap = importedKeyMap({ walletWif: keys[0].toWif(), ordWif: keys[1].toWif(), identityWif: keys[2].toWif() });
const selection: SweepSelection = {
  sweepBsv: true,
  selectedOrdinals: new Set(),
  selectedBsv20Ticks: new Set(),
  selectedBsv21TokenIds: new Set(),
};
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

test('native scanner requests OrdLock metadata and keeps listed 1-sat outputs in their class', async () => {
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
        assert.deepEqual(options, {
          unspent: true,
          events: true,
          tags: ['ordlock', 'insc', 'bsv20', 'bsv21'],
          sats: true,
          limit: 0,
        });
        return [listing];
      },
    },
  } as unknown as OneSatServices;
  const result = await scanAddress(services, addresses[0]);
  assert.equal(searches, 1);
  assert.equal(result.listings.length, 1);
  assert.equal(result.ordinals.length, 1);
  assert.deepEqual(result.ordinals[0].events, listing.events);
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

test('listed ordinals cancel into the destination with pay, ord and identity keys', async () => {
  const listed = mixed.map((output) => ({
    ...output,
    events: [...(output.events ?? []), 'ordlock'],
  }));
  const ordinals = mock.method(sweepOrdinals, 'execute', async (_ctx, input) => {
    assert.deepEqual(
      input.keys.map((key) => key.toPublicKey().toAddress()),
      [addresses[0], addresses[2], addresses[1]],
    );
    return { txid: 'ordinal-receipt' };
  });
  const funding = mock.method(sweepBsv, 'execute', async () => {
    throw new Error('funding must not run');
  });
  const task = run(
    { ...emptyAssets(), ordinals: listed },
    { ...selection, sweepBsv: false, selectedOrdinals: new Set(listed.map((output) => output.outpoint)) },
  );
  await task.promise;
  assert.equal(ordinals.mock.callCount(), 1);
  assert.equal(funding.mock.callCount(), 0);
  assert.equal(task.results[0].txid, 'ordinal-receipt');
  assert.equal(task.completed.size, 3);
});

test('BSV-20 ticks use sweepBsv20, not ordinal cancel', async () => {
  const ordinals = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'unexpected' }));
  const tokens = mock.method(sweepBsv20, 'execute', async (_ctx, input) => {
    assert.equal(input.inputs[0].tick, 'TEST');
    return { txid: 'bsv20-receipt' };
  });
  const listed = {
    ...mixed[0],
    events: [...(mixed[0].events ?? []), 'tick:TEST', 'type:application/bsv-20'],
    data: { insc: { file: { type: 'application/bsv-20' }, json: { p: 'bsv-20', op: 'transfer', tick: 'TEST', amt: '10' } } },
  };
  const task = run(
    { ...emptyAssets(), bsv20Tokens: [listed] },
    { ...selection, sweepBsv: false, selectedBsv20Ticks: new Set(['TEST']) },
  );
  await task.promise;
  assert.equal(ordinals.mock.callCount(), 0);
  assert.equal(tokens.mock.callCount(), 1);
  assert.equal(task.results[0].txid, 'bsv20-receipt');
});

test('missing imported owner cannot invoke ordinals', async () => {
  const ordinals = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'unexpected' }));
  const task = run(
    { ...emptyAssets(), ordinals: [{ ...mixed[0], events: [] }] },
    { ...selection, sweepBsv: false, selectedOrdinals: new Set([mixed[0].outpoint]) },
  );
  await task.promise;
  assert.equal(ordinals.mock.callCount(), 0);
  assert.match(task.results[0].error!, /Cannot match imported owner/);
});

test('BSV class error still sweeps selected ordinals', async () => {
  mock.method(sweepBsv, 'execute', async () => ({ error: 'funding failure' }));
  const ordinals = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'ordinal-receipt' }));
  const task = run(
    { ...emptyAssets(), funding: [mixed[1]], ordinals: [mixed[0]] },
    { ...selection, selectedOrdinals: new Set([mixed[0].outpoint]) },
  );
  await task.promise;
  assert.equal(task.results[0].error, 'funding failure');
  assert.equal(task.results[1].txid, 'ordinal-receipt');
  assert.equal(ordinals.mock.callCount(), 1);
  assert.equal(task.completed.size, 1);
});

test('successful BSV survives ordinal failure and retry never repeats completed inputs', async () => {
  const funding = mock.method(sweepBsv, 'execute', async (_ctx, input) => {
    assert.equal(input.keys[0].toPublicKey().toAddress(), addresses[1]);
    return { txid: 'funding-receipt' };
  });
  const ordinals = mock.method(sweepOrdinals, 'execute', async () => ({ error: 'ordinal failure' }));
  const assets = { ...emptyAssets(), funding: [mixed[1]], ordinals: [mixed[0]] };
  const selected = { ...selection, selectedOrdinals: new Set([mixed[0].outpoint]) };
  const task = run(assets, selected);
  await task.promise;
  assert.equal(task.results[0].txid, 'funding-receipt');
  assert.equal(task.results[1].error, 'ordinal failure');
  ordinals.mock.mockImplementation(async () => ({ txid: 'ordinal-receipt' }));
  const retry = run(assets, selected, task.completed);
  await retry.promise;
  assert.equal(funding.mock.callCount(), 1);
  assert.equal(ordinals.mock.callCount(), 2);
  assert.equal(retry.results[0].txid, 'ordinal-receipt');
});

test('abort after an accepted BSV transaction retains its receipt and stops ordinals', async () => {
  const controller = new AbortController();
  mock.method(sweepBsv, 'execute', async () => {
    controller.abort();
    return { txid: 'funding-receipt' };
  });
  const ordinals = mock.method(sweepOrdinals, 'execute', async () => ({ txid: 'unexpected' }));
  const task = run(
    { ...emptyAssets(), funding: [mixed[1]], ordinals: [mixed[0]] },
    { ...selection, selectedOrdinals: new Set([mixed[0].outpoint]) },
    new Set(),
    controller.signal,
  );
  await assert.rejects(task.promise);
  assert.equal(task.results[0].txid, 'funding-receipt');
  assert.equal(ordinals.mock.callCount(), 0);
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

test('more than 25 imported ordinals sweep in sequential batches and retry only unfinished batches', async () => {
  const tx = new Transaction();
  for (let i = 0; i < 57; i++) tx.addOutput({ lockingScript: new P2PKH().lock(addresses[i % 3]), satoshis: 1 });
  const ordinals = tx.outputs.map((_, i) => row(tx, i, addresses[i % 3]));
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
  const assets = { ...emptyAssets(), ordinals, funding: [mixed[1]] };
  const selected = { ...selection, selectedOrdinals: new Set(ordinals.map((output) => output.outpoint)) };
  const first = run(assets, selected);
  await first.promise;
  assert.deepEqual(sizes, [25, 25]);
  assert.equal(first.completed.size, 26);
  assert.equal(first.results[0].txid, 'funding-receipt');
  assert.equal(first.results[1].txid, 'batch-1');
  assert.equal(first.results[2].error, 'batch retry');
  assert.equal(funding.mock.callCount(), 1);
  fail = false;
  const retry = run(assets, selected, first.completed);
  await retry.promise;
  assert.deepEqual(sizes, [25, 25, 25, 7]);
  assert.equal(retry.completed.size, 58);
  assert.equal(funding.mock.callCount(), 1);
});
