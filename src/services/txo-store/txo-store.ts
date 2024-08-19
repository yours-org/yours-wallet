import { Transaction } from '@bsv/sdk';
import type { Indexer } from './models/indexer';
import type { IndexContext } from './models/index-context';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Txo, TxoLookup, TxoStatus, type TxoResults } from './models/txo';
import { Spend } from './models/spend';
import { NetWork } from 'yours-wallet-provider';
import { GP_BASE_URL } from '../../utils/constants';
import { Ingest, IngestStatus } from './models/ingest';
import { Block } from '../block-store/block';
import { TxnStore } from '../txn-store/txn-store';
import { InventoryStore } from '../inv-store/inv-store';
const TXO_DB_VERSION = 1;

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
    value: Ingest;
    indexes: {
      status: [number, number, number];
    };
  };
  state: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
}

export class TxoStore {
  queueLength = 0;
  private destroyed = false;
  private interval?: NodeJS.Timeout;
  private constructor(
    public txoDb: IDBPDatabase<TxoSchema>,
    public indexers: Indexer[],
    public txnStore: TxnStore,
    public invStore: InventoryStore,
    public notifyQueueStats?: (queueStats: { length: number }) => void,
  ) {}

  static async init(
    accountId: string,
    indexers: Indexer[],
    txnStore: TxnStore,
    invStore: InventoryStore,
    startSync = false,
    notifyQueueStats?: (queueStats: { length: number }) => void,
    network: NetWork = NetWork.Mainnet,
  ) {
    if (!accountId) throw new Error('Missing accountId');

    const txoDb = await openDB<TxoSchema>(`txostore-${accountId}-${network}`, TXO_DB_VERSION, {
      upgrade(db) {
        const txos = db.createObjectStore('txos', { keyPath: ['txid', 'vout'] });
        txos.createIndex('events', 'events', { multiEntry: true });
        txos.createIndex('owner', 'owner');
        const ingestQueue = db.createObjectStore('ingestQueue', { keyPath: 'txid' });
        ingestQueue.createIndex('status', ['status', 'height', 'idx']);
        db.createObjectStore('state', { keyPath: 'key' });
      },
    });

    const txoStore = new TxoStore(txoDb, indexers, txnStore, invStore, notifyQueueStats);

    if (startSync) {
      const lastSync = await txoStore.txoDb.get('state', 'lastSync');
      if (!lastSync) {
        await txoStore.sync();
        await txoStore.txoDb.put('state', { key: 'lastSync', value: Date.now().toString() });
      }

      invStore.sync();
      txoStore.processQueue();
    }
    return txoStore;
  }

  async destroy() {
    this.destroyed = true;
    if (this.interval) clearInterval(this.interval);
    this.txoDb.close();
  }

  async getTxo(txid: string, vout: number): Promise<Txo | undefined> {
    return this.txoDb.get('txos', [txid, vout]);
  }

  async searchTxos(lookup: TxoLookup, limit = 10, from?: string): Promise<TxoResults> {
    const dbkey = lookup.toQueryKey();
    const start = from || dbkey;
    const query: IDBKeyRange = IDBKeyRange.bound(start, dbkey + '\uffff', true, false);
    const results: TxoResults = { txos: [] };
    for await (const cursor of this.txoDb.transaction('txos').store.index('events').iterate(query)) {
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
    const t = this.txoDb.transaction('txos', 'readwrite');
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
    const resp = await this.txnStore.broadcast(tx);
    if (resp.status === 'success') {
      if (!dependencyTxids.length) {
        await this.ingest(tx);
      } else {
        const ingests = dependencyTxids.map((txid) => new Ingest(txid, Date.now(), 0, true));
        ingests.push(new Ingest(tx.id('hex') as string, Date.now(), 0, false));
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
    }

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
        // if (await this.txnDb.getKey('txns', input.sourceTXID)) {
        //   continue;
        // }
        await this.ingest(input.sourceTransaction);
      } else {
        input.sourceTransaction = await this.txnStore.loadTx(input.sourceTXID, fromRemote);
        if (!input.sourceTransaction) throw new Error(`Failed to get source tx ${input.sourceTXID}`);
      }
    }

    const t = this.txoDb.transaction('txos', 'readwrite');
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

    await this.txnStore.saveTx(tx);
    if (fromRemote && checkSpends) {
      await this.updateSpends(ctx.txos.map((t) => `${t.txid}_${t.vout}`));
    }
    return ctx;
  }

  async getQueueLength() {
    this.queueLength = await this.txoDb.countFromIndex(
      'ingestQueue',
      'status',
      IDBKeyRange.bound([IngestStatus.DOWNLOAD], [IngestStatus.INGEST, Number.MAX_SAFE_INTEGER]),
    );
    return this.queueLength;
  }

  async queue(ingests: Ingest[]) {
    const t = this.txoDb.transaction('ingestQueue', 'readwrite');
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

  async processIngests() {
    const query = IDBKeyRange.bound([IngestStatus.INGEST, 0], [IngestStatus.INGEST, Number.MAX_SAFE_INTEGER]);
    const ingests = await this.txoDb.getAllFromIndex('ingestQueue', 'status', query, 100);
    if (ingests.length) {
      console.log('Ingesting', ingests.length, 'txs');
      for await (const ingest of ingests) {
        const tx = await this.txnStore.loadTx(ingest.txid);
        if (!tx) {
          console.error('Failed to get tx', ingest.txid);
          continue;
        }
        await this.ingest(tx, true, ingest.isDep ? TxoStatus.DEPENDENCY : TxoStatus.CONFIRMED, ingest.checkSpends);
        ingest.status = IngestStatus.CONFIRMED;
        await this.txoDb.put('ingestQueue', ingest);
        if (this.notifyQueueStats) {
          this.notifyQueueStats({ length: await this.getQueueLength() });
        }
      }
      // if (this.notifyQueueStats) {
      //   this.notifyQueueStats({ length:  });
      // }
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (this.destroyed) {
      return;
    }
    this.processIngests();
  }

  async processDownloads(returnOnDone = false) {
    try {
      const query = IDBKeyRange.bound([IngestStatus.DOWNLOAD, 0], [IngestStatus.DOWNLOAD, Number.MAX_SAFE_INTEGER]);
      const ingests = await this.txoDb.getAllFromIndex('ingestQueue', 'status', query, 25);
      if (ingests.length) {
        await this.txnStore.ensureTxns(ingests.map((i) => i.txid));
        const downloadQueue = this.txoDb.transaction('ingestQueue', 'readwrite');
        await Promise.all([
          ...ingests.map((i) => {
            i.status = i.downloadOnly ? IngestStatus.CONFIRMED : IngestStatus.INGEST;
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
    if (this.destroyed) {
      return;
    }
    this.processDownloads();
  }
}
