import { Indexer, type IndexData, type IndexSummary, type ParseContext } from './types';
import { parseAddress } from './parseAddress';

/**
 * FundIndexer identifies P2PKH outputs to owned addresses.
 * These are standard "funding" UTXOs that can be spent normally.
 *
 * Data structure: string (address)
 *
 * Basket: '' (default/empty basket)
 * Tags: None
 * CustomInstructions: Just the owner address
 */
export class FundIndexer extends Indexer {
  tag = 'fund';
  name = 'Funds';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;
    const address = parseAddress(script, 0, this.network);
    if (txo.satoshis < 2n) return;

    // Set owner on the txo (used by other indexers and summerize)
    txo.owner = address;

    const tags: string[] = [];
    tags.push(`address:${address}`);

    txo.basket = '';

    return {
      data: address,
      tags,
    };
  }

  async summerize(ctx: ParseContext): Promise<IndexSummary | undefined> {
    let satsOut = 0n;
    let satsIn = 0n;

    // Calculate satoshis spent from our addresses (inputs)
    for (const input of ctx.tx.inputs) {
      if (!input.sourceTransaction) {
        // If we don't have source transaction data, we can't determine balance change
        return;
      }

      const sourceOutput = input.sourceTransaction.outputs[input.sourceOutputIndex];
      const address = parseAddress(sourceOutput.lockingScript, 0, this.network);

      if (this.owners.has(address)) {
        satsOut += BigInt(sourceOutput.satoshis || 0);
      }
    }

    // Calculate satoshis received to our addresses (outputs)
    satsIn = ctx.txos.reduce((acc, txo) => {
      if (!txo.data[this.tag]) return acc;
      return acc + (txo.owner && this.owners.has(txo.owner) ? txo.satoshis : 0n);
    }, 0n);

    const balance = Number(satsIn - satsOut);
    if (balance) {
      return {
        amount: balance,
      };
    }
  }
}
