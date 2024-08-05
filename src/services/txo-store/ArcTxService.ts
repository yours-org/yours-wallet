import { BroadcastFailure, BroadcastResponse, MerklePath, Transaction } from '@bsv/sdk';
import { TransactionService } from '../Transaction.service';
import { Txn, TxnStatus, TxnStatusResponse } from './models/txn';

export class ArcSatTransactionService implements TransactionService {
  constructor(
    public baseUrl: string,
    public apiKey?: string,
  ) {}
  async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    console.log('Broadcasting', tx.id('hex'), tx.toHex());
    let txBuf: Buffer | undefined;
    try {
      txBuf = Buffer.from(tx.toEF());
    } catch {
      txBuf = Buffer.from(tx.toBinary());
    }
    const resp = await fetch(`${this.baseUrl}/v1/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(txBuf),
    });
    const body = await resp.json();
    if (resp.status !== 200) {
      return {
        status: 'error',
        code: resp.status.toString(),
        description: `${body.detail}`,
      } as BroadcastFailure;
    }
    return {
      status: 'success',
      txid: body,
      message: 'Transaction broadcast successfully',
    } as BroadcastResponse;
  }

  async status(txid: string): Promise<TxnStatusResponse | undefined> {
    const resp = await fetch(`${this.baseUrl}/v1/tx/${txid}`);
    if (resp.status > 200) {
      return undefined;
    }
    const body = await resp.json();
    switch (body.status) {
      case 'MINED':
        return {
          status: TxnStatus.CONFIRMED,
          proof: Buffer.from(body.merkleProof, 'hex'),
        };
      case 'REJECTED':
        return {
          status: TxnStatus.INVALID,
          message: body.detail,
        };
      default:
        return {
          status: TxnStatus.PENDING,
        };
    }
  }

  async fetch(txid: string): Promise<Txn | undefined> {
    throw new Error('Method not implemented.');
  }
}
