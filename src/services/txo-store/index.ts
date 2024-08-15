import { MerklePath, Transaction } from '@bsv/sdk';
import type { Indexer } from './models/indexer';
import type { IndexContext } from './models/index-context';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Txo, TxoLookup, TxoStatus, type TxoResults } from './models/txo';
import { TxnIngest, TxnStatus, type Txn } from './models/txn';
import { BlockHeaderService } from '../block-headers';
import { Block } from './models/block';
import { Spend } from './models/spend';
import { NetWork } from 'yours-wallet-provider';
import { TransactionService } from '../Transaction.service';
import { GP_BASE_URL } from '../../utils/constants';

const TXO_DB_VERSION = 1;
const TXN_DB_VERSION = 1;

export interface TxoSchema extends DBSchema {
  txos: {
    key: [string, number];
    value: Txo;
    indexes: {
      events: string;
      owner: string;
    };
  };
  ingestQueue: {
    key: string;
    value: TxnIngest;
    indexes: {
      status: [number, number, number];
    };
  };
}

export interface TxnSchema extends DBSchema {
  txns: {
    key: string;
    value: Txn;
    indexes: {
      status: [number, number];
    };
  };
}
export class TxoStore {
  txoDb: Promise<IDBPDatabase<TxoSchema>>;
  txnDb: Promise<IDBPDatabase<TxnSchema>>;
  queueLength = 0;
  constructor(
    public accountId: string,
    public indexers: Indexer[] = [],
    public txService: TransactionService,
    public blocksService?: BlockHeaderService,
    public network: NetWork = NetWork.Mainnet,
    public notifyQueueStats?: (queueStats: { length: number }) => void,
  ) {
    this.txoDb = openDB<TxoSchema>(`txostore-${accountId}-${network}`, TXO_DB_VERSION, {
      upgrade(db) {
        const txos = db.createObjectStore('txos', { keyPath: ['txid', 'vout'] });
        txos.createIndex('events', 'events', { multiEntry: true });
        txos.createIndex('owner', 'owner');
        const ingestQueue = db.createObjectStore('ingestQueue', { keyPath: 'txid' });
        ingestQueue.createIndex('status', ['status', 'height', 'idx']);
      },
    });
    this.txnDb = openDB<TxnSchema>(`txnstore-${network}`, TXN_DB_VERSION, {
      upgrade(db) {
        const txns = db.createObjectStore('txns', { keyPath: 'txid' });
        txns.createIndex('status', ['status', 'block.height']);
      },
    });
  }

  async getTx(txid: string, fromRemote = false): Promise<Transaction | undefined> {
    const db = await this.txnDb;
    let txn = await db.get('txns', txid);
    if (txn) {
      const tx = Transaction.fromBinary(txn.rawtx);
      if (txn.proof) {
        tx.merklePath = MerklePath.fromBinary(Array.from(txn.proof));
      }
      return tx;
    }
    if (!fromRemote) return;
    const tx = await this.txService.fetch(txid);
    txn = {
      txid,
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
    await db.put('txns', txn);
    return tx;
  }

  async getTxo(txid: string, vout: number): Promise<Txo | undefined> {
    return (await this.txoDb).get('txos', [txid, vout]);
  }

  async searchTxos(lookup: TxoLookup, limit = 10, from?: string): Promise<TxoResults> {
    const db = await this.txoDb;
    const dbkey = lookup.toQueryKey();
    const start = from || dbkey;
    const query: IDBKeyRange = IDBKeyRange.bound(start, dbkey + '\uffff', true, false);
    const results: TxoResults = { txos: [] };
    for await (const cursor of db.transaction('txos').store.index('events').iterate(query)) {
      const txo = Txo.fromObject(cursor.value, this.indexers);
      results.nextPage = cursor.key;
      if (lookup.owner && txo.owner != lookup.owner) continue;
      results.txos.push(txo);
      if (limit > 0 && results.txos.length >= limit) {
        return results;
      }
    }
    delete results.nextPage;
    return results;
  }

  private async updateSpends(outpoints: string[]) {
    const db = await this.txoDb;
    const resp = await fetch(`${GP_BASE_URL}/api/spends`, {
      method: 'POST',
      body: JSON.stringify(outpoints),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (resp.status !== 200) {
      console.error('Failed to get spends', resp.status, await resp.text());
      return;
    }
    const spends = (await resp.json()) as string[];
    const t = db.transaction('txos', 'readwrite');
    for (const [i, outpoint] of outpoints.entries()) {
      if (spends[i]) {
        const [txid, vout] = outpoint.split('_');
        const txoData = await t.store.get([txid, parseInt(vout, 10)]);
        if (!txoData) {
          console.error('Missing txo', txid, vout);
          continue;
        }
        const txo = Txo.fromObject(txoData, this.indexers);
        txo.spend = new Spend(spends[i], 0);
        console.log('Updated spend', txid, vout, spends[i]);
        t.store.put(txo.toObject());
      }
    }
    await t.done;
  }

  async broadcast(tx: Transaction, dependencyTxids: string[] = []) {
    const resp = await this.txService.broadcast(tx);
    if (resp.status === 'success') {
      if (!dependencyTxids.length) {
        await this.ingest(tx);
      } else {
        const ingests = dependencyTxids.map((txid) => new TxnIngest(txid, Date.now(), 0, true));
        ingests.push(new TxnIngest(tx.id('hex') as string, Date.now(), 0, false));
        await this.queue(ingests);
      }
    }
    return resp;
  }

  async ingest(
    tx: Transaction,
    fromRemote = false,
    status = TxoStatus.CONFIRMED,
    checkSpends = false,
  ): Promise<IndexContext> {
    const txid = tx.id('hex') as string;
    console.log('Ingesting', txid);
    const block = {
      height: Date.now(),
      idx: 0n,
    } as Block;
    if (tx.merklePath) {
      const txHash = tx.hash('hex');
      block.height = tx.merklePath.blockHeight;
      block.idx = BigInt(tx.merklePath.path[0].find((p) => p.hash == txHash)?.offset || 0);
      block.hash = (await this.blocksService?.getHashByHeight(tx.merklePath.blockHeight)) || '';
      if (this.blocksService) {
        try {
          if (!(await tx.merklePath.verify(txid, this.blocksService))) {
            throw new Error('Invalid proof');
          }
        } catch (e) {
          console.error('Invalid proof', e);
        }
      }
    }

    const txoDb = await this.txoDb;
    const txnDb = await this.txnDb;
    const ctx: IndexContext = {
      txid,
      tx,
      block,
      spends: [],
      txos: [],
    };

    for (const input of tx.inputs) {
      if (!input.sourceTXID) {
        if (!input.sourceTransaction) {
          throw new Error('Input missing source transaction');
        }
        input.sourceTXID = input.sourceTransaction.id('hex') as string;
      }
      if (input.sourceTransaction) {
        if (await txnDb.getKey('txns', input.sourceTXID)) {
          continue;
        }
        await this.ingest(input.sourceTransaction);
      } else {
        input.sourceTransaction = await this.getTx(input.sourceTXID, fromRemote);
        if (!input.sourceTransaction) throw new Error(`Failed to get source tx ${input.sourceTXID}`);
      }
    }

    const txn = {
      txid,
      rawtx: tx.toBinary(),
      block,
      status: TxnStatus.PENDING,
      proof: tx.merklePath && tx.merklePath.toBinary(),
    };
    await txnDb.put('txns', txn);

    const t = txoDb.transaction('txos', 'readwrite');
    for await (const [vin, input] of tx.inputs.entries()) {
      const data = await t.store.get([input.sourceTXID!, input.sourceOutputIndex]);
      const spend = data
        ? Txo.fromObject(data, this.indexers)
        : new Txo(
            input.sourceTXID!,
            input.sourceOutputIndex,
            BigInt(input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!),
            input.sourceTransaction!.outputs[input.sourceOutputIndex]!.lockingScript.toBinary(),
            status,
          );

      spend.spend = new Spend(txid, vin, block);
      t.store.put(spend.toObject());
      ctx.spends.push(spend);
    }

    for await (const [vout, output] of tx.outputs.entries()) {
      const data = await t.store.get([txid, vout]);
      let txo: Txo;
      if (data) {
        txo = Txo.fromObject(data, this.indexers);
      } else {
        const script = output.lockingScript.toBinary();
        // console.log('script', output.lockingScript.toBinary())
        txo = new Txo(txid, vout, BigInt(output.satoshis!), script, status);
      }
      txo.status = status;

      txo.block = block;
      txo.events = [];
      ctx.txos.push(txo);
      this.indexers.forEach((i) => {
        try {
          const data = i.parse && i.parse(ctx, vout);
          if (data) {
            txo.data[i.tag] = data;
          }
        } catch (e) {
          console.error('indexer error: continuing', i.tag, e);
        }
      });
    }
    this.indexers.forEach((i) => i.preSave && i.preSave(ctx));
    for (const txo of ctx.txos) {
      t.store.put(txo.toObject());
    }
    await t.done;
    txn.status = block.height < 50000000 ? TxnStatus.CONFIRMED : TxnStatus.BROADCASTED;
    await txnDb.put('txns', txn);
    if (fromRemote && checkSpends) {
      await this.updateSpends(ctx.txos.map((t) => `${t.txid}_${t.vout}`));
    }
    return ctx;
  }

  async getQueueLength() {
    const txoDb = await this.txoDb;

    this.queueLength = await txoDb.countFromIndex(
      'ingestQueue',
      'status',
      IDBKeyRange.bound([0], [Number.MAX_SAFE_INTEGER]),
    );
    return this.queueLength;
  }

  async queue(ingests: TxnIngest[]) {
    const db = await this.txoDb;
    const t = db.transaction('ingestQueue', 'readwrite');
    for (const ingest of ingests) {
      await t.store.put(ingest);
    }
    await t.done;

    if (this.notifyQueueStats) {
      this.notifyQueueStats({ length: await this.getQueueLength() });
    }
  }

  async sync() {
    for (const indexer of this.indexers) {
      await indexer.sync(this);
    }
  }
  async processQueue() {
    await this.getQueueLength();
    if (this.queueLength && this.notifyQueueStats) {
      this.notifyQueueStats({ length: this.queueLength });
    }
    this.processDownloads();
    this.processIngests();
  }

  async processIngests(returnOnDone = false) {
    const db = await this.txoDb;
    const query = IDBKeyRange.bound([TxnStatus.INGEST, 0], [TxnStatus.INGEST, Number.MAX_SAFE_INTEGER]);
    const ingests = await db.getAllFromIndex('ingestQueue', 'status', query, 100);
    if (ingests.length) {
      console.log('Ingesting', ingests.length, 'txs');
      for await (const ingest of ingests) {
        const tx = await this.getTx(ingest.txid);
        if (!tx) {
          console.error('Failed to get tx', ingest.txid);
          continue;
        }
        await this.ingest(tx, true, ingest.isDep ? TxoStatus.DEPENDENCY : TxoStatus.CONFIRMED, ingest.checkSpends);
        await db.delete('ingestQueue', ingest.txid);
        if (this.notifyQueueStats) {
          this.notifyQueueStats({ length: --this.queueLength });
        }
      }
      if (this.notifyQueueStats) {
        this.notifyQueueStats({ length: await this.getQueueLength() });
      }
    } else if (!returnOnDone) {
      await new Promise((r) => setTimeout(r, 1000));
    } else return;
    this.processIngests();
  }

  async processDownloads(returnOnDone = false) {
    try {
      const txoDb = await this.txoDb;
      const query = IDBKeyRange.bound([TxnStatus.DOWNLOAD, 0], [TxnStatus.DOWNLOAD, Number.MAX_SAFE_INTEGER]);
      const ingests = await txoDb.getAllFromIndex('ingestQueue', 'status', query, 25);
      if (ingests.length) {
        await this.ensureTxns(ingests.map((i) => i.txid));
        const downloadQueue = txoDb.transaction('ingestQueue', 'readwrite');
        await Promise.all([
          ...ingests.map((i) => {
            if (i.downloadOnly) {
              return downloadQueue.store.delete(i.txid);
            }
            i.status = TxnStatus.INGEST;
            return downloadQueue.store.put(i);
          }),
          downloadQueue.done,
        ]);
        if (this.notifyQueueStats) {
          this.notifyQueueStats({ length: await this.getQueueLength() });
        }
      } else if (!returnOnDone) {
        await new Promise((r) => setTimeout(r, 1000));
      } else return;
    } catch (e) {
      console.error('Failed to ingest txs', e);
      await new Promise((r) => setTimeout(r, 1000));
    }
    this.processDownloads();
  }

  async ensureTxns(txids: string[]) {
    const db = await this.txnDb;
    console.log('Downloading', txids.length, 'txs');
    const t = db.transaction('txns', 'readonly');
    const foundTxids = await Promise.all([...txids.map((txid) => t.store.getKey(txid).catch(() => null)), t.done]);
    const missing: { [txid: string]: boolean } = {};
    for (const [i, txid] of txids.entries()) {
      if (!foundTxids[i]) missing[txid] = true;
    }
    const missingTxids = Object.keys(missing);
    if (missingTxids.length) {
      const results = await this.txService.batchFetch(missingTxids);
      const tTxn = db.transaction('txns', 'readwrite');
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
