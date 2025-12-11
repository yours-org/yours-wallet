import { Indexer, type IndexData, type ParseContext } from './types';
import { parseAddress } from './parseAddress';

/**
 * LockIndexer identifies time-locked P2PKH outputs to owned addresses.
 * These are outputs that cannot be spent until a specific time/block height.
 *
 * Data structure: { address: string, until: number }
 *
 * Basket: 'lock'
 * Tags: address
 */
export class LockIndexer extends Indexer {
  tag = 'lock';
  name = 'Time-Locked Funds';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;

    // Check if this is a time-locked output
    // Time-locked outputs have OP_CHECKLOCKTIMEVERIFY in the script
    const scriptBinary = script.toBinary();
    const hasCheckLockTimeVerify = scriptBinary.includes(0xb1); // OP_CHECKLOCKTIMEVERIFY opcode

    if (!hasCheckLockTimeVerify) return;
    if (txo.satoshis < 2n) return;

    // Parse the address from the script
    const address = parseAddress(script, 0, this.network);

    // Set owner on the txo (used by other indexers and TransactionParser filtering)
    txo.owner = address;

    // Extract lock time from script
    // This is a simplified version - actual implementation would need proper script parsing
    // TODO: Implement proper lock time extraction from script
    const until = 0;

    const tags: string[] = [];
    tags.push(`address:${address}`);

    txo.basket = 'lock';

    return {
      data: { address, until },
      tags,
    };
  }
}
