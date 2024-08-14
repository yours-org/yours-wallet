import { BroadcastFailure, BroadcastResponse, MerklePath, Transaction, Utils } from '@bsv/sdk';
import { TransactionService } from '../Transaction.service';
import { TxnStatus, TxnStatusResponse } from './models/txn';
import { GP_BASE_URL } from '../../utils/constants';

export class OneSatTransactionService implements TransactionService {
  constructor(public baseUrl = GP_BASE_URL) {}
  async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    console.log('Broadcasting', tx.id('hex'), tx.toHex());
    const resp = await fetch(`${this.baseUrl}/api/tx/bin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(tx.toBinary()),
    });
    const body = await resp.json();
    if (resp.status !== 200) {
      return {
        status: 'error',
        code: resp.status.toString(),
        description: `${body.message}`,
      } as BroadcastFailure;
    }
    return {
      status: 'success',
      txid: body,
      message: 'Transaction broadcast successfully',
    } as BroadcastResponse;
  }

  async status(txid: string): Promise<TxnStatusResponse | undefined> {
    const resp = await fetch(`${this.baseUrl}/api/tx/${txid}/proof`);
    switch (resp.status) {
      case 200:
        return {
          status: TxnStatus.CONFIRMED,
          proof: [...Buffer.from(await resp.arrayBuffer())],
        };
      case 404:
        return { status: TxnStatus.PENDING };
      default:
        return undefined;
    }
  }

  async fetch(txid: string): Promise<Transaction> {
    const resp = await fetch(`${this.baseUrl}/api/tx/${txid}`);
    console.log('Fetching', txid);
    if (resp.status !== 200) throw new Error(`${resp.status} - Failed to fetch tx ${txid}`);
    const beef = await resp.arrayBuffer();
    return Transaction.fromBEEF([...Buffer.from(beef)]);
  }

  async batchFetch(txids: string[]): Promise<Transaction[]> {
    const resp = await fetch(`${this.baseUrl}/api/tx/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(txids),
    });
    if (resp.status !== 200) throw new Error(`${resp.status} - Failed to fetch txs: ${await resp.text()}`);
    const beefs = await resp.arrayBuffer();
    const reader = new Utils.Reader([...Buffer.from(beefs)]);
    const txs: Transaction[] = [];
    while (reader.pos < beefs.byteLength) {
      const len = reader.readVarIntNum();
      const beef = reader.read(len);
      const tx = Transaction.fromBEEF(beef);
      txs.push(tx);
    }
    return txs;
  }
}
