import { MerklePath, Transaction } from '@bsv/sdk';
import type { Indexer } from './models/indexer';
import type { IndexContext } from './models/index-context';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Txo, TxoLookup, TxoStatus, type TxoResults } from './models/txo';
import { TxnIngest, TxnStatus, type Txn } from './models/txn';
import { BlockHeaderService } from '../block-headers';
import { Block } from './models/block';
import { Spend } from './models/spend';
import { Buffer } from 'buffer';
import { NetWork } from 'yours-wallet-provider';
import { TransactionService } from '../Transaction.service';
import { GP_BASE_URL } from '../../utils/constants';
import { stat } from 'fs';

const VERSION = 1;

export interface TxoSchema extends DBSchema {
  txos: {
    key: [string, number];
    value: Txo;
    indexes: {
      events: string;
      owner: string;
      spent: string;
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
  downloadQueue: {
    key: string;
    value: TxnIngest;
    indexes: {
      status: [number, number, number];
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
    // if (accountId) throw new Error('empty-account-id');
    this.txoDb = openDB<TxoSchema>(`txostore-${accountId}-${network}`, VERSION, {
      upgrade(db) {
        const txos = db.createObjectStore('txos', { keyPath: ['txid', 'vout'] });
        txos.createIndex('events', 'events', { multiEntry: true });
        txos.createIndex('owner', 'owner');
        txos.createIndex('spent', 'spent');
        const queue = db.createObjectStore('ingestQueue', { keyPath: 'txid' });
        queue.createIndex('status', ['status', 'height', 'idx']);
      },
    });
    this.txnDb = openDB<TxnSchema>(`txnstore-${network}`, VERSION, {
      upgrade(db) {
        const txns = db.createObjectStore('txns', { keyPath: 'txid' });
        txns.createIndex('status', ['status', 'block.height']);
        const queue = db.createObjectStore('downloadQueue', { keyPath: 'txid' });
        queue.createIndex('status', ['status', 'height', 'idx']);
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

  async getTxs(txids: string[], fromRemote = false): Promise<(Txn | undefined)[]> {
    const db = await this.txnDb;
    const t = db.transaction('txns', 'readonly');
    const txns = await Promise.all(txids.map((txid) => t.store.get(txid)));
    await t.done;
    const missing: string[] = [];
    const txById: { [txid: string]: Txn } = {};
    for (const [i, txn] of txns.entries()) {
      if (txn && txn.rawtx) {
        txById[txn.txid] = txn;
      } else {
        missing.push(txids[i]);
      }
    }

    if (missing.length && fromRemote) {
      const results = await this.txService.batchFetch(missing);
      const t = db.transaction('txns', 'readwrite');
      await Promise.all(
        results.map((tx) => {
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
          txById[txn.txid] = txn;
          t.store.put(txn);
        }),
      );
      await t.done;
    }
    return txids.map((txid) => txById[txid]);
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

  async syncSpends() {
    const db = await this.txoDb;
    const outpoints = await db.getAllKeysFromIndex('txos', 'spent', IDBKeyRange.only('0'));
    for (let i = 0; i < outpoints.length; i += 50) {
      await this.updateSpends(outpoints.slice(i, i + 50).map(([txid, vout]) => `${txid}_${vout}`));
    }
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
        txo.setSpend(new Spend(spends[i], 0));
        console.log('Updated spend', txid, vout, spends[i]);
        t.store.put(txo);
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
        const ingests = dependencyTxids.map((txid) => new TxnIngest(txid, Date.now(), 0));
        ingests.push(new TxnIngest(tx.id('hex') as string, Date.now(), 0));
        await this.queue(ingests);
      }
    }
    return resp;
  }

  async ingest(tx: Transaction, fromRemote = false, status = TxoStatus.Assumed): Promise<IndexContext> {
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
          if (await tx.merklePath.verify(txid, this.blocksService)) {
            block.height = Date.now();
            block.idx = 0n;
          } else {
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
          );

      spend.setSpend(new Spend(txid, vin, block));
      t.store.put(spend);
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
        txo = new Txo(txid, vout, BigInt(output.satoshis!), script);
      }

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
    this.indexers.forEach((i) => i.save && i.save(ctx));

    const hasEvents: number[] = [];
    for (const txo of ctx.txos) {
      txo.events = [];
      const spent = txo.spend ? '1' : '0';
      const sort = (txo.spend?.block?.height || txo.block?.height || Date.now()).toString(16).padStart(8, '0');
      let hasEvent = false;
      for (const [tag, data] of Object.entries(txo.data)) {
        hasEvent = true;
        for (const e of data.events) {
          txo.events.push(`${spent}:${tag}:${e.id}:${e.value}:${sort}:${txo.block?.idx}:${txo.vout}:${txo.satoshis}`);
        }
      }
      hasEvents.push(txo.vout);
      t.store.put(txo);
    }
    await t.done;
    txn.status = block.height < 50000000 ? TxnStatus.CONFIRMED : TxnStatus.BROADCASTED;
    await txnDb.put('txns', txn);
    if (checkSpends && hasEvents.length) {
      this.updateSpends(hasEvents.map((vout) => `${txid}_${vout}`));
    }
    return ctx;
  }

  async getQueueLength() {
    const txnDb = await this.txnDb;
    const txoDb = await this.txoDb;
    // const query: IDBKeyRange = ;
    const [txs, txos] = await Promise.all([
      txnDb.countFromIndex(
        'downloadQueue',
        'status',
        IDBKeyRange.bound([TxnStatus.DOWNLOAD, 0], [TxnStatus.DOWNLOAD, Date.now()]),
      ),
      txoDb.countFromIndex(
        'ingestQueue',
        'status',
        IDBKeyRange.bound([TxnStatus.INGEST, 0], [TxnStatus.INGEST, Date.now()]),
      ),
    ]);
    this.queueLength = txs + txos;
    return this.queueLength;
  }

  async queue(ingests: TxnIngest[]) {
    const db = await this.txnDb;
    const t = db.transaction('downloadQueue', 'readwrite');
    for (const ingest of ingests) {
      await t.store.put(ingest);
    }
    await t.done;

    if (this.notifyQueueStats) {
      this.notifyQueueStats({ length: await this.getQueueLength() });
    }
  }

  async processQueue() {
    this.downloadTxns();
    this.ingestQueue();
  }

  async ingestQueue(returnOnDone = false) {
    const db = await this.txoDb;
    const query: IDBKeyRange = IDBKeyRange.bound([TxnStatus.INGEST, 0], [TxnStatus.INGEST, Date.now()]);
    const ingests = await db.getAllFromIndex('ingestQueue', 'status', query, 25);
    if (ingests.length) {
      console.log('Ingesting', ingests.length, 'txs');
      const outpoints: string[] = [];
      for await (const txn of ingests) {
        const tx = await this.getTx(txn.txid);
        if (!tx) {
          console.error('Failed to get tx', txn.txid);
          continue;
        }
        const idxData = await this.ingest(tx, true, false);
        for (const txo of idxData.txos) {
          outpoints.push(`${txo.txid}_${txo.vout}`);
        }
        txn.status = TxnStatus.CONFIRMED;
        await db.delete('ingestQueue', txn.txid);
        // if (this.notifyQueueStats) {
        //   this.notifyQueueStats({ length: --this.queueLength });
        // }
      }
      if (this.notifyQueueStats) {
        this.notifyQueueStats({ length: await this.getQueueLength() });
      }
    } else if (!returnOnDone) {
      await new Promise((r) => setTimeout(r, 1000));
    } else return;
    this.ingestQueue();
  }

  async downloadTxns(returnOnDone = false) {
    try {
      const txnDb = await this.txnDb;
      const txoDb = await this.txoDb;
      const query: IDBKeyRange = IDBKeyRange.bound([TxnStatus.DOWNLOAD, 0], [TxnStatus.DOWNLOAD, Date.now()]);
      const ingests = await txnDb.getAllFromIndex('downloadQueue', 'status', query, 25);

      if (ingests.length) {
        console.log('Ingesting', ingests.length, 'txs');
        const txns = await this.getTxs(
          ingests.map((i) => i.txid),
          true,
        );
        for await (const [i, txn] of txns.entries()) {
          if (!txn) {
            console.error('Failed to get tx', ingests[i].txid);
            continue;
          }

          ingests[i].status = TxnStatus.INGEST;
          await txoDb.put('ingestQueue', ingests[i]);
          await txnDb.delete('downloadQueue', ingests[i].txid);
        }
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
    this.downloadTxns();
  }
}
