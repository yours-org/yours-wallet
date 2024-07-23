import { MerklePath, Transaction } from '@bsv/sdk';
import type { Indexer } from './models/indexer';
import type { IndexContext } from './models/index-context';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Txo, TxoLookup, type TxoResults } from './models/txo';
import { TxnIngest, TxnStatus, type Txn } from './models/txn';
import { BlockHeaderService } from '../block-headers';
import { Block } from './models/block';
import { Spend } from './models/spend';
import { Buffer } from 'buffer';
import { NetWork } from 'yours-wallet-provider';
import { TransactionService } from '../Transaction.service';

const VERSION = 1;

export interface TxoSchema extends DBSchema {
  txos: {
    key: [string, number];
    value: Txo;
    indexes: {
      events: string;
      owner: string;
    };
  };
  txns: {
    key: string;
    value: Txn;
    indexes: {
      status: [number, number];
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

export class TxoStore {
  db: Promise<IDBPDatabase<TxoSchema>>;
  constructor(
    public accountId: string,
    public indexers: Indexer[] = [],
    public txService: TransactionService,
    public blocksService?: BlockHeaderService,
    public network: NetWork = NetWork.Mainnet,
  ) {
    if (!accountId) throw new Error('empty-account-id');
    this.db = openDB<TxoSchema>(`txostore-${accountId}-${network}`, VERSION, {
      upgrade(db) {
        const txos = db.createObjectStore('txos', { keyPath: ['txid', 'vout'] });
        txos.createIndex('events', 'events', { multiEntry: true });
        txos.createIndex('owner', 'owner');
        const txns = db.createObjectStore('txns', { keyPath: 'txid' });
        txns.createIndex('status', ['status', 'block.height']);
        const queue = db.createObjectStore('ingestQueue', { keyPath: 'txid' });
        queue.createIndex('status', ['status', 'height', 'idx']);
      },
    });
  }

  async getTx(txid: string, fromRemote = false): Promise<Transaction | undefined> {
    const db = await this.db;
    let txn = await db.get('txns', txid);
    if (txn) {
      const tx = Transaction.fromBinary(Array.from(new Uint8Array(txn.rawtx)));
      if (txn.proof) {
        tx.merklePath = MerklePath.fromBinary(Array.from(txn.proof));
      }
      return tx;
    }
    if (!fromRemote) return;
    txn = await this.txService.fetch(txid);
    if (!txn) return;
    const tx = Transaction.fromBinary(Array.from(txn.rawtx));
    if (txn.proof) {
      tx.merklePath = MerklePath.fromBinary(Array.from(txn.proof));
    }

    await db.put('txns', txn);
    return tx;
  }

  async getTxo(txid: string, vout: number): Promise<Txo | undefined> {
    return (await this.db).get('txos', [txid, vout]);
  }

  async searchTxos(lookup: TxoLookup, limit = 10, from?: string): Promise<TxoResults> {
    const db = await this.db;
    const dbkey = lookup.toQueryKey();
    const start = from || dbkey;
    const query: IDBKeyRange = IDBKeyRange.bound(start, dbkey + '\uffff', true, false);
    const results: TxoResults = { txos: [] };
    console.time('findTxos');
    for await (const cursor of db.transaction('txos').store.index('events').iterate(query)) {
      const txo = Txo.fromObject(cursor.value, this.indexers);
      results.nextPage = cursor.key;
      if (lookup.owner && txo.owner != lookup.owner) continue;
      results.txos.push(txo);
      console.timeLog('findTxos', txo.txid, txo.vout);
      if (limit > 0 && results.txos.length >= limit) {
        console.timeEnd('findTxos');
        return results;
      }
    }
    delete results.nextPage;
    console.timeEnd('findTxos');
    return results;
  }

  async broadcast(tx: Transaction) {
    const resp = await this.txService.broadcast(tx);
    if (resp.status === 'success') {
      await this.ingest(tx);
    }
    return resp;
  }

  async ingest(tx: Transaction, fromRemote = false): Promise<IndexContext> {
    const txid = tx.id('hex') as string;
    console.log('Ingesting', txid);
    const block = {
      height: Date.now(),
      idx: 0n,
    } as Block;
    if (tx.merklePath) {
      const txHash = tx.hash('hex');
      const idx = tx.merklePath.path[0].find((p) => p.hash == txHash)?.offset || 0;
      block.height = tx.merklePath.blockHeight;
      block.idx = BigInt(idx);
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

    const db = await this.db;

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
        if (await db.getKey('txns', input.sourceTXID)) {
          continue;
        }
        await this.ingest(input.sourceTransaction);
      } else {
        input.sourceTransaction = await this.getTx(input.sourceTXID, fromRemote);
        if (!input.sourceTransaction) throw new Error(`Failed to get source tx ${input.sourceTXID}`);
      }
    }

    const t = db.transaction('txos', 'readwrite');
    for await (const [vin, input] of tx.inputs.entries()) {
      const data = await t.store.get([input.sourceTXID!, input.sourceOutputIndex]);
      const spend = data
        ? Txo.fromObject(data)
        : new Txo(
            input.sourceTXID!,
            input.sourceOutputIndex,
            BigInt(input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!),
            Buffer.from(input.sourceTransaction!.outputs[input.sourceOutputIndex]!.lockingScript.toBinary()),
          );

      spend.spend = new Spend(txid, vin, block);
      ctx.spends.push(spend);
      t.store.put(spend);
    }

    for await (const [vout, output] of tx.outputs.entries()) {
      const data = await t.store.get([txid, vout]);
      let txo: Txo;
      if (data) {
        txo = Txo.fromObject(data);
      } else {
        const script = output.lockingScript.toBinary();
        // console.log('script', output.lockingScript.toBinary())
        txo = new Txo(txid, vout, BigInt(output.satoshis!), new Uint8Array(script));
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
    for (const txo of ctx.txos) {
      txo.events = [];
      const spent = txo.spend ? '1' : '0';
      const sort = (txo.spend?.block?.height || txo.block?.height || Date.now()).toString(16).padStart(8, '0');
      for (const [tag, data] of Object.entries(txo.data)) {
        for (const e of data.events) {
          txo.events.push(`${tag}:${e.id}:${e.value}:${spent}:${sort}:${txo.block?.idx}:${txo.vout}:${txo.satoshis}`);
        }
      }
      t.store.put(txo);
    }
    await t.done;
    await db.put('txns', {
      txid,
      rawtx: new Uint8Array(tx.toBinary()),
      block,
      status: block.height < 50000000 ? TxnStatus.CONFIRMED : TxnStatus.BROADCASTED,
      proof: tx.merklePath && Buffer.from(tx.merklePath.toBinary()),
    });
    return ctx;
  }

  async queue(ingests: TxnIngest[]) {
    const db = await this.db;
    const t = db.transaction('ingestQueue', 'readwrite');
    for (const ingest of ingests) {
      const txn = await t.store.get(ingest.txid);
      if (txn) continue;
      await t.store.put(ingest);
    }
    await t.done;
  }

  async ingestQueue() {
    const db = await this.db;
    const query: IDBKeyRange = IDBKeyRange.bound([TxnStatus.INGEST, 0], [TxnStatus.INGEST, Date.now()]);
    const txns = await db.getAllFromIndex('ingestQueue', 'status', query, 100);
    console.log('Ingesting', txns.length, 'txs');
    for (const txn of txns) {
      const tx = await this.getTx(txn.txid, true);
      if (!tx) {
        console.error('Failed to get tx', txn.txid);
        continue;
      }
      await this.ingest(tx, true);
      txn.status = TxnStatus.CONFIRMED;
      await db.put('ingestQueue', txn);
    }
    if (!txns.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    this.ingestQueue();
  }
}
