import { Hash, MerklePath, Utils } from '@bsv/sdk';
import type { sdk } from '@bsv/wallet-toolbox-client';

/**
 * Proven-tx rows the storage server will accept. The server checks every
 * proof it is sent during sync (wallet-toolbox `validateSyncProof`) and
 * rejects the whole chunk over one bad row, so these checks mirror its rules
 * and repair what can be repaired before a push.
 */

/** A proven-tx row as sync chunks carry it. */
export type ProvenTxRow = NonNullable<sdk.SyncChunk['provenTxs']>[number];
type ProvenTx = ProvenTxRow;

export type ProofCheck =
  | { ok: true }
  /** Structurally repairable from the row itself: the txid leaf is there but unflagged or at another index. */
  | { ok: false; fix: { merklePath: number[]; index: number }; reason: string }
  /** The row has to be replaced by a fresh proof. */
  | { ok: false; reason: string };

const lower = (s: string) => s.toLowerCase();

/** The raw transaction hashes to the row's txid (the server checks this first). */
export const rawTxMatches = (row: Pick<ProvenTx, 'txid' | 'rawTx'>): boolean =>
  Array.isArray(row.rawTx) &&
  row.rawTx.length > 0 &&
  Utils.toHex(Hash.hash256(row.rawTx).reverse()) === lower(row.txid);

/** The server's structural rules, minus the chain lookups (see `chainCheckProof`). */
export const checkProofStructure = (row: ProvenTx): ProofCheck => {
  const txid = lower(row.txid);
  let path: MerklePath;
  try {
    path = MerklePath.fromBinary(row.merklePath);
  } catch {
    return { ok: false, reason: 'Merkle path does not parse' };
  }
  if (path.blockHeight !== row.height) return { ok: false, reason: 'Merkle path height does not match the record' };

  const leaf = path.path[0]?.find((item) => item.hash !== undefined && lower(item.hash) === txid);
  if (!leaf) return { ok: false, reason: 'Merkle path does not contain the transaction' };

  let root: string;
  try {
    root = path.computeRoot(txid);
  } catch {
    return { ok: false, reason: 'Merkle root does not compute' };
  }
  if (lower(root) !== lower(row.merkleRoot))
    return { ok: false, reason: 'computed Merkle root does not match the record' };

  if (leaf.txid === true && leaf.offset === row.index) return { ok: true };
  leaf.txid = true;
  return {
    ok: false,
    fix: { merklePath: path.toBinary(), index: leaf.offset },
    reason: leaf.offset === row.index ? 'transaction leaf not flagged' : 'recorded index does not match the path',
  };
};

/** Block hash and Merkle root as the server derives them from an 80-byte header. */
export const headerIds = (header: number[]): { blockHash: string; merkleRoot: string } => ({
  blockHash: Utils.toHex(Hash.hash256(header).reverse()),
  merkleRoot: Utils.toHex(header.slice(36, 68).reverse()),
});

export interface ChainLookups {
  isValidRootForHeight: (root: string, height: number) => Promise<boolean>;
  getHeaderForHeight: (height: number) => Promise<number[]>;
}

/** Whether the proof's block is still on the active chain, with matching header metadata. */
export const chainCheckProof = async (row: ProvenTx, chain: ChainLookups): Promise<string | null> => {
  if (!(await chain.isValidRootForHeight(lower(row.merkleRoot), row.height))) {
    return 'Merkle root is not active at the recorded height';
  }
  const header = await chain.getHeaderForHeight(row.height);
  if (header.length !== 80) return 'active block header must be 80 bytes';
  const ids = headerIds(header);
  if (ids.blockHash !== lower(row.blockHash) || ids.merkleRoot !== lower(row.merkleRoot)) {
    return 'block metadata does not match the active header';
  }
  return null;
};

/**
 * Proof fields rebuilt from a freshly fetched Merkle path and the active
 * header at its height, or null when the fetched proof does not hold up.
 */
export const rebuildProofFields = (
  txid: string,
  path: MerklePath,
  header: number[],
): Pick<ProvenTx, 'merklePath' | 'index' | 'height' | 'blockHash' | 'merkleRoot'> | null => {
  const id = lower(txid);
  const leaf = path.path[0]?.find((item) => item.hash !== undefined && lower(item.hash) === id);
  if (!leaf || header.length !== 80) return null;
  leaf.txid = true;
  const ids = headerIds(header);
  let root: string;
  try {
    root = lower(path.computeRoot(id));
  } catch {
    return null;
  }
  if (root !== ids.merkleRoot) return null;
  return {
    merklePath: path.toBinary(),
    index: leaf.offset,
    height: path.blockHeight,
    blockHash: ids.blockHash,
    merkleRoot: ids.merkleRoot,
  };
};
