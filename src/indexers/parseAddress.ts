import { OP, Utils, type Script } from '@bsv/sdk';

/**
 * Parse a P2PKH address from a locking script
 * @param script - The locking script to parse
 * @param offset - Chunk offset (default 0)
 * @param network - Network type for address encoding
 * @returns Base58Check encoded address or empty string if not P2PKH
 */
export function parseAddress(script: Script, offset = 0, network: 'mainnet' | 'testnet' = 'mainnet'): string {
  if (script.chunks[0 + offset]?.op !== OP.OP_DUP) return '';
  if (script.chunks[1 + offset]?.op !== OP.OP_HASH160) return '';
  if (script.chunks[2 + offset]?.data?.length !== 20) return '';
  if (script.chunks[3 + offset]?.op !== OP.OP_EQUALVERIFY) return '';
  if (script.chunks[4 + offset]?.op !== OP.OP_CHECKSIG) return '';
  return Utils.toBase58Check(script.chunks[2 + offset].data!, network === 'mainnet' ? [0] : [111]);
}
