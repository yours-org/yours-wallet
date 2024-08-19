import { BroadcastResponse, BroadcastFailure, Transaction, MerklePath } from '@bsv/sdk';
import { DBSchema, IDBPDatabase, openDB } from '@tempfix/idb';
import { NetWork } from 'yours-wallet-provider';
import { Block } from '../block-store/block';
import { BroadcastService } from '../broadcast-service/broadcast-service';
import { TxnService } from './txn-service';
import { BlockStore } from '../block-store/block-service';

const TXN_DB_VERSION = 1;

export enum TxnStatus {
  REJECTED = -1,
  PENDING = 0,
  BROADCASTED = 1,
  DOWNLOAD = 2,
  INGEST = 3,
  CONFIRMED = 4,
  IMMUTABLE = 5,
}

export interface Txn {
  txid: string;
  rawtx: number[];
  proof?: number[];
  block: Block;
  status: TxnStatus;
}

export interface TxnSchema extends DBSchema {
  txns: {
    key: string;
    value: Txn;
    indexes: {
      status: [number, number];
    };
  };
  state: {
    key: string;
    value: {
      key: string;
      state: number;
    };
  };
}

export class TxnStore {
  private constructor(
    public txnDb: IDBPDatabase<TxnSchema>,
    public txnService: TxnService,
    public broadcastService: BroadcastService,
    public blocksStore: BlockStore,
  ) {}

  static async init(
    txService: TxnService,
    broadcastService: BroadcastService,
    blocksStore: BlockStore,
    network: NetWork = NetWork.Mainnet,
  ): Promise<TxnStore> {
    const txnDb = await openDB<TxnSchema>(`txns-${network}`, TXN_DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('txns', { keyPath: 'txid' }).createIndex('status', ['status', 'height']);
        db.createObjectStore('state', { keyPath: 'key' });
      },
    });

    return new TxnStore(txnDb, txService, broadcastService, blocksStore);
  }

  destroy() {
    this.txnDb.close();
  }

  broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    return this.broadcastService.broadcast(tx);
  }

  async loadTx(txid: string, fromRemote = false): Promise<Transaction | undefined> {
    const txn = await this.txnDb.get('txns', txid);
    if (txn) {
      const tx = Transaction.fromBinary(txn.rawtx);
      if (txn.proof) {
        tx.merklePath = MerklePath.fromBinary(Array.from(txn.proof));
      }
      return tx;
    }
    if (!fromRemote) return;
    const tx = await this.txnService.fetch(txid);
    return tx;
  }

  async saveTx(tx: Transaction, status = TxnStatus.PENDING) {
    const txn: Txn = {
      txid: tx.id('hex'),
      rawtx: tx.toBinary(),
      block: new Block(),
      status,
    };
    if (tx.merklePath) {
      const txHash = tx.hash('hex');
      txn.block.height = tx.merklePath.blockHeight;
      txn.block.idx = BigInt(tx.merklePath.path[0].find((p) => p.hash == txHash)?.offset || 0);
      txn.proof = tx.merklePath.toBinary();
      txn.status = TxnStatus.CONFIRMED;
      try {
        if (!(await tx.merklePath.verify(txn.txid, this.blocksStore))) {
          throw new Error('Invalid proof');
        }
      } catch (e) {
        console.error(e);
      }
    }
    await this.txnDb.put('txns', txn);
  }

  async ensureTxns(txids: string[]) {
    console.log('Downloading', txids.length, 'txs');
    const t = this.txnDb.transaction('txns', 'readonly');
    const foundTxids = await Promise.all([...txids.map((txid) => t.store.getKey(txid).catch(() => null)), t.done]);
    const missing: { [txid: string]: boolean } = {};
    for (const [i, txid] of txids.entries()) {
      if (!foundTxids[i]) missing[txid] = true;
    }
    const missingTxids = Object.keys(missing);
    if (missingTxids.length) {
      const results = await this.txnService.batchFetch(missingTxids);
      const tTxn = this.txnDb.transaction('txns', 'readwrite');
      await Promise.all([
        ...results.map(async (tx) => {
          const txn: Txn = {
            txid: tx.id('hex') as string,
            rawtx: tx.toBinary(),
            block: new Block(),
            status: TxnStatus.PENDING,
          };
          if (tx.merklePath) {
            const txHash = tx.hash('hex');
            txn.block.height = tx.merklePath.blockHeight;
            txn.block.idx = BigInt(tx.merklePath.path[0].find((p) => p.hash == txHash)?.offset || 0);
            txn.proof = tx.merklePath.toBinary();
            txn.status = TxnStatus.CONFIRMED;
          }
          if (!missing[txn.txid]) throw new Error('Missing txid: ' + txn.txid);
          await tTxn.store.put(txn);
        }),
        tTxn.done,
      ]);
    }
  }
}
