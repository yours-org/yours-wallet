/** Offline import regressions. No live wallet, real key access, signing or broadcast. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';
import { scanAddress } from '../src/sweep/scanner';
import { importedKeyMap } from '../src/utils/keys';

const keys = [1, 2, 3].map((value) => PrivateKey.fromString(value.toString(16), 'hex'));
const addresses = keys.map((key) => key.toPublicKey().toAddress());
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
const ordfs = { getContentUrl: (outpoint: string) => `ordfs:${outpoint}` };

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
    ordfs,
  } as unknown as OneSatServices;
  const result = await scanAddress(services, addresses[0]);
  assert.equal(searches, 1);
  assert.equal(result.listings.length, 1);
  assert.equal(result.ordinals.length, 1);
  assert.deepEqual(result.ordinals[0].events, listing.events);
  assert.equal(result.ordinals[0].contentUrl, `ordfs:${listing.outpoint}`);
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
      ordfs,
    } as unknown as OneSatServices;
    await assert.rejects(scanAddress(services, addresses[0]));
    assert.equal(searches, 0);
  }
});

test('importedKeyMap resolves pay, ord and identity addresses and skips missing WIFs', () => {
  const full = importedKeyMap({ walletWif: keys[0].toWif(), ordWif: keys[1].toWif(), identityWif: keys[2].toWif() });
  assert.deepEqual([...full.keys()].sort(), [...addresses].sort());
  assert.equal(full.get(addresses[1])?.toWif(), keys[1].toWif());
  const partial = importedKeyMap({ walletWif: keys[0].toWif(), ordWif: '', identityWif: '' });
  assert.deepEqual([...partial.keys()], [addresses[0]]);
});
