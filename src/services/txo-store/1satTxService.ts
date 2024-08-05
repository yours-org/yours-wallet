import { BroadcastFailure, BroadcastResponse, MerklePath, Transaction } from '@bsv/sdk';
import { TransactionService } from '../Transaction.service';
import { Block } from './models/block';
import { Txn, TxnStatus, TxnStatusResponse } from './models/txn';
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
          proof: Buffer.from(await resp.json(), 'base64'),
        };
      case 404:
        return { status: TxnStatus.PENDING };
      default:
        return undefined;
    }
  }

  async fetch(txid: string): Promise<Txn | undefined> {
    const resp = await fetch(`${this.baseUrl}/api/tx/${txid}`);
    console.log('Fetching', txid);
    if (!resp.ok) return;
    if (resp.status !== 200) throw new Error(`Failed to fetch tx ${txid}`);
    const { rawtx, proof } = await resp.json();
    const buf = Buffer.from(rawtx, 'base64');
    if (!buf.length) throw new Error(`Failed to fetch tx ${txid}`);
    const txn = {
      txid,
      rawtx: buf,
      block: new Block(),
      status: TxnStatus.CONFIRMED,
    } as Txn;
    if (proof) {
      txn.proof = Buffer.from(proof, 'base64');
      txn.status = TxnStatus.CONFIRMED;
      const merklePath = MerklePath.fromBinary(Array.from(txn.proof));
      txn.block.height = merklePath.blockHeight;
      txn.block.idx = BigInt(merklePath.path[0].find((p) => p.hash == txid)?.offset || 0);
    } else {
      txn.status = TxnStatus.BROADCASTED;
    }
    return txn;
  }
}
