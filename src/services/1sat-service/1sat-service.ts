import { BroadcastFailure, BroadcastResponse, Transaction, Utils } from '@bsv/sdk';
import { GP_BASE_URL } from '../utils/constants';
import { BroadcastService, BroadcastStatusResponse, BroadcastStatus } from './broadcast-service/broadcast-service';
import { InventoryService, TxLog } from './inv-store/inv-service';
import { TxnService } from './txn-store/txn-service';
import { BlockHeader, BlockHeaderService } from './block-store/block-service';
import EventEmitter from 'events';

export class OneSatService
  extends EventEmitter
  implements BroadcastService, TxnService, BlockHeaderService, InventoryService
{
  private interval: NodeJS.Timeout | undefined;
  public constructor(public baseUrl = GP_BASE_URL) {
    super();
  }

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

  async status(txid: string): Promise<BroadcastStatusResponse | undefined> {
    const resp = await fetch(`${this.baseUrl}/api/tx/${txid}/proof`);
    switch (resp.status) {
      case 200:
        return {
          status: BroadcastStatus.CONFIRMED,
          proof: [...Buffer.from(await resp.arrayBuffer())],
        };
      case 404:
        return { status: BroadcastStatus.MEMPOOL };
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

  async pollTxLogs(owner: string, fromHeight = 0): Promise<TxLog[]> {
    const resp = await fetch(`${this.baseUrl}/api/tx/address/${owner}/from/${fromHeight}`);
    return resp.json();
  }

  // async subscribe(owners: string[], fromHeight = 0, callback: (txLog: TxLog) => void): Promise<void> {
  //   throw new Error('Method not implemented.');
  // }

  // async unsubscribe() {
  //   return;
  // }

  async getBlocks(lastHeight: number, limit = 1000): Promise<BlockHeader[]> {
    const resp = await fetch(`${this.baseUrl}/api/blocks/list/${lastHeight}?limit=${limit}`);
    return resp.json();
  }

  async getChaintip(): Promise<BlockHeader> {
    const resp = await fetch(`${this.baseUrl}/api/blocks/tip`);
    return resp.json();
  }
}
