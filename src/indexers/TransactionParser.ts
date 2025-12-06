import { Transaction } from '@bsv/sdk';
import type { Indexer, ParseContext, Txo } from './types';
import type { WalletAPI } from '../services/WalletServices.service';
import { Outpoint } from './Outpoint';

/**
 * Represents the result of parsing a single output
 */
export interface ParsedOutput {
  vout: number;
  basket: string;
  tags: string[];
  customInstructions?: any;
}

/**
 * Represents the result of parsing an entire transaction
 */
export interface ParseResult {
  outputs: ParsedOutput[];
  summary?: any;
}

/**
 * TransactionParser runs indexers over a transaction to extract
 * basket, tags, and custom instructions for wallet-toolbox.
 *
 * This is a stripped-down version of TxoStore.ingest() that only
 * handles parsing without SPV verification or storage.
 */
export class TransactionParser {
  constructor(
    public indexers: Indexer[],
    public owners: Set<string>,
    private walletStorage: any,
    private walletServices: WalletAPI,
  ) {}

  /**
   * Parse a transaction and extract wallet-toolbox metadata
   */
  async parse(tx: Transaction, isBroadcasted: boolean): Promise<ParseResult> {
    const ctx = this.buildContext(tx);

    // Load source transactions for all inputs
    await this.loadSourceTransactions(tx);

    // Parse all inputs (build ctx.spends)
    await this.parseInputs(ctx);

    // Run parse on each output with each indexer
    for (const [vout] of tx.outputs.entries()) {
      for (const indexer of this.indexers) {
        const indexData = await indexer.parse(ctx, vout, isBroadcasted);
        if (indexData) {
          ctx.txos[vout].data[indexer.tag] = indexData;
        }
      }
    }

    // Run summerize on each indexer
    for (const indexer of this.indexers) {
      const summary = await indexer.summerize(ctx, isBroadcasted);
      if (summary) {
        ctx.summary[indexer.tag] = summary;
      }
    }

    return this.convertToWalletToolboxFormat(ctx);
  }

  /**
   * Parse all inputs - run indexers on source outputs to populate ctx.spends
   */
  private async parseInputs(ctx: ParseContext): Promise<void> {
    for (const input of ctx.tx.inputs) {
      if (!input.sourceTransaction) continue;

      const sourceOutput = input.sourceTransaction.outputs[input.sourceOutputIndex];
      if (!sourceOutput) continue;

      const sourceTxid = input.sourceTransaction.id('hex');
      const sourceVout = input.sourceOutputIndex;

      // Create txo structure for the source output
      const sourceTxo: Txo = {
        satoshis: BigInt(sourceOutput.satoshis || 0),
        script: sourceOutput.lockingScript.toBinary(),
        data: {},
        outpoint: new Outpoint(sourceTxid, sourceVout),
      };

      // Build a minimal context for parsing the source output
      const sourceCtx: ParseContext = {
        tx: input.sourceTransaction,
        txid: sourceTxid,
        txos: [sourceTxo],
        spends: [],
        summary: {},
        indexers: ctx.indexers,
      };

      // Run all indexers on this source output
      for (const indexer of this.indexers) {
        const indexData = await indexer.parse(sourceCtx, sourceVout, false);
        if (indexData) {
          sourceTxo.data[indexer.tag] = indexData;
        }
      }

      // Add to ctx.spends
      ctx.spends.push(sourceTxo);
    }
  }

  /**
   * Load source transactions for all inputs and set them on tx.inputs[].sourceTransaction
   */
  private async loadSourceTransactions(tx: Transaction): Promise<void> {
    for (const input of tx.inputs) {
      if (input.sourceTransaction) {
        continue; // Already loaded
      }

      const txid = input.sourceTXID;
      if (!txid) {
        throw new Error('Input missing source transaction ID');
      }

      // Try to load from wallet storage first
      let rawTx = await this.walletStorage?.getRawTxOfKnownValidTransaction(txid);

      // Fall back to wallet services if not in storage
      if (!rawTx) {
        const result = await this.walletServices.getRawTx(txid);
        if (result.rawTx) {
          rawTx = result.rawTx;
        }
      }

      if (rawTx) {
        input.sourceTransaction = Transaction.fromBinary(rawTx);
      }
    }
  }

  /**
   * Build minimal parse context from transaction
   */
  private buildContext(tx: Transaction): ParseContext {
    const txid = tx.id('hex');
    return {
      tx,
      txid,
      txos: tx.outputs.map((output, vout) => ({
        satoshis: BigInt(output.satoshis || 0),
        script: output.lockingScript.toBinary(),
        data: {},
        outpoint: new Outpoint(txid, vout),
      })),
      spends: [],
      summary: {},
      indexers: this.indexers,
    };
  }

  /**
   * Convert parsed context to wallet-toolbox format with baskets and tags
   * Filters outputs to only return those owned by addresses in the owners set
   */
  private convertToWalletToolboxFormat(ctx: ParseContext): ParseResult {
    const outputs: ParsedOutput[] = [];

    for (const txo of ctx.txos) {
      // Filter: only include outputs we own
      if (!txo.owner || !this.owners.has(txo.owner)) {
        continue;
      }

      let basket = '';
      const tags: string[] = [];

      // Determine basket based on which indexer claimed it
      // Priority: origin > lock > fund (default)
      if (txo.data.origin) {
        basket = '1sat';
        // TODO: Extract type tag from inscription data
      } else if (txo.data.lock) {
        basket = 'lock';
        // TODO: Add lock-specific tags
      } else if (txo.data.fund) {
        basket = '';
      }

      outputs.push({
        vout: txo.outpoint.vout,
        basket,
        tags,
        customInstructions: Object.keys(txo.data).length > 0 ? txo.data : undefined,
      });
    }

    return {
      outputs,
      summary: Object.keys(ctx.summary).length > 0 ? ctx.summary : undefined,
    };
  }
}
