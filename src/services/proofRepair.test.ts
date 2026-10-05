import { describe, expect, test } from 'bun:test';
import { MerklePath } from '@bsv/sdk';
import { Hash, Utils } from '@bsv/sdk';
import { checkProofStructure, headerIds, rawTxMatches, rebuildProofFields, type ProvenTxRow } from './proofRepair';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const HEIGHT = 900_000;

const path = (flagged: boolean) =>
  new MerklePath(HEIGHT, [
    [
      { offset: 0, hash: B },
      { offset: 1, hash: A, ...(flagged ? { txid: true } : {}) },
    ],
  ]);

const row = (p: MerklePath, index: number, merkleRoot = p.computeRoot(A)): ProvenTxRow =>
  ({
    provenTxId: 1,
    txid: A,
    height: HEIGHT,
    index,
    merklePath: p.toBinary(),
    rawTx: [1],
    blockHash: 'c'.repeat(64),
    merkleRoot,
  }) as ProvenTxRow;

describe('checkProofStructure', () => {
  test('accepts a flagged leaf at the recorded index', () => {
    expect(checkProofStructure(row(path(true), 1)).ok).toBe(true);
  });

  test('flags an unflagged leaf and fixes it from the row', () => {
    const check = checkProofStructure(row(path(false), 1));
    expect(check.ok).toBe(false);
    if (check.ok || !('fix' in check)) throw new Error('expected a fix');
    expect(check.fix.index).toBe(1);
    expect(checkProofStructure({ ...row(path(false), 1), ...check.fix }).ok).toBe(true);
  });

  test('corrects a recorded index that does not match the path', () => {
    const check = checkProofStructure(row(path(true), 0));
    if (check.ok || !('fix' in check)) throw new Error('expected a fix');
    expect(check.fix.index).toBe(1);
  });

  test('needs a fresh proof when the path lacks the txid or the root differs', () => {
    const other = new MerklePath(HEIGHT, [
      [
        { offset: 0, hash: B, txid: true },
        { offset: 1, hash: 'd'.repeat(64) },
      ],
    ]);
    const missing = checkProofStructure({ ...row(path(true), 1), merklePath: other.toBinary() });
    expect(missing.ok === false && !('fix' in missing)).toBe(true);

    const wrongRoot = checkProofStructure(row(path(true), 1, 'e'.repeat(64)));
    expect(wrongRoot.ok === false && !('fix' in wrongRoot)).toBe(true);
  });

  test('needs a fresh proof when the path height differs', () => {
    const check = checkProofStructure({ ...row(path(true), 1), height: HEIGHT + 1 });
    expect(check.ok === false && !('fix' in check)).toBe(true);
  });
});

describe('rebuildProofFields', () => {
  const headerFor = (merkleRootHex: string): number[] => {
    const rootBytes = Array.from(Buffer.from(merkleRootHex, 'hex')).reverse();
    return [...new Array(36).fill(0), ...rootBytes, ...new Array(12).fill(0)];
  };

  test('rebuilds from a fetched path whose root matches the active header', () => {
    const p = path(false);
    const header = headerFor(p.computeRoot(A));
    const fields = rebuildProofFields(A, p, header);
    expect(fields?.index).toBe(1);
    expect(fields?.merkleRoot).toBe(headerIds(header).merkleRoot);
    expect(checkProofStructure({ ...row(path(true), 1), ...fields! }).ok).toBe(true);
  });

  test('refuses a fetched path that does not match the header', () => {
    expect(rebuildProofFields(A, path(true), headerFor('f'.repeat(64)))).toBeNull();
  });
});

describe('headerIds', () => {
  test('matches the genesis block hash and Merkle root', () => {
    const genesis = Utils.toArray(
      '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c',
      'hex',
    );
    expect(headerIds(genesis)).toEqual({
      blockHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
    });
  });
});

describe('rawTxMatches', () => {
  test('true only when the raw transaction hashes to the txid', () => {
    const rawTx = [1, 2, 3, 4];
    const txid = Utils.toHex(Hash.hash256(rawTx).reverse());
    expect(rawTxMatches({ txid, rawTx })).toBe(true);
    expect(rawTxMatches({ txid: txid.toUpperCase(), rawTx })).toBe(true);
    expect(rawTxMatches({ txid: A, rawTx })).toBe(false);
    expect(rawTxMatches({ txid, rawTx: [] })).toBe(false);
  });
});
