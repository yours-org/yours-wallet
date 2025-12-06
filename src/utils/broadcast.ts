import { Transaction, Beef } from '@bsv/sdk';
import type { Wallet } from '@bsv/wallet-toolbox';
import type { TransactionParser } from '../indexers/TransactionParser';

export interface BroadcastResult {
  txid?: string;
  error?: string;
}

/**
 * Broadcasts a transaction through the wallet-toolbox flow:
 * 1. Parses transaction through indexers to extract baskets/tags/customInstructions
 * 2. Broadcasts via services.postBeef
 * 3. Internalizes into wallet storage for merkle proof tracking
 *
 * @param wallet - Wallet instance with services and storage
 * @param tx - Signed transaction to broadcast
 * @param parser - Transaction parser with configured indexers
 * @param description - Optional description for the transaction
 * @returns BroadcastResult with txid or error
 */
export async function broadcastTransaction(
  wallet: Wallet,
  tx: Transaction,
  parser: TransactionParser,
  description?: string,
): Promise<BroadcastResult> {
  try {
    const txid = tx.id('hex');

    // Parse transaction through indexers to extract baskets/tags/customInstructions
    const parseResult = await parser.parse(tx, true);

    // Build BEEF for broadcast
    const beef = new Beef();
    for (const input of tx.inputs) {
      if (input.sourceTransaction) {
        beef.mergeRawTx(input.sourceTransaction.toBinary());
      }
    }
    beef.mergeRawTx(tx.toBinary());
    const atomicBeef = beef.toBinaryAtomic(txid);

    // Broadcast via services
    const services = wallet.getServices();
    const postResults = await services.postBeef(beef, [txid]);

    // Check if broadcast succeeded
    const hasSuccess = postResults.some((result) =>
      result.txidResults.some((r) => r.txid === txid && r.status === 'success'),
    );

    if (!hasSuccess) {
      const errors = postResults
        .flatMap((r) => r.txidResults.filter((t) => t.txid === txid))
        .map((r) => r.error?.message || 'unknown error')
        .join(', ');
      return { error: `Broadcast failed: ${errors}` };
    }

    // Convert parsed outputs to internalizeAction format
    const outputs = parseResult.outputs.map((output) => ({
      outputIndex: output.vout,
      protocol: 'basket insertion' as const,
      insertionRemittance: {
        basket: output.basket,
        customInstructions: output.customInstructions,
        tags: output.tags,
      },
    }));

    // Internalize into wallet storage with parsed outputs
    await wallet.internalizeAction({
      tx: atomicBeef,
      outputs,
      description: description || 'Transaction',
      labels: [],
    });

    return { txid };
  } catch (error) {
    console.error('broadcastTransaction failed:', error);
    return { error: JSON.stringify(error) };
  }
}
