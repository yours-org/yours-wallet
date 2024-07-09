import { Broadcaster, MerklePath, Transaction } from '@bsv/sdk';
import type { Indexer } from './models/indexer';
import type { IndexContext } from './models/index-context';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Txo, TxoLookup, type TxoResults } from './models/txo';
import { TxnStatus, type Txn } from './models/txn';
import { BlockHeaderService } from '../block-headers';
import { Block } from './models/block';
import { Spend } from './models/spend';
import { Buffer } from 'buffer';
import { parseAddress } from './models/address';
import { NetWork } from 'yours-wallet-provider';

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
  };
}

export class TxoStore {
  db: Promise<IDBPDatabase<TxoSchema>>;
  constructor(
    public accountId: string,
    public indexers: Indexer[] = [],
    public addresses = new Set<string>(),
    public broadcaster?: Broadcaster,
    public blocksService?: BlockHeaderService,
    public network: NetWork = NetWork.Mainnet,
  ) {
    this.indexers.forEach((i) => (i.addresses = this.addresses));
    this.db = openDB<TxoSchema>(`txostore-${accountId}-${network}`, VERSION, {
      upgrade(db) {
        const txos = db.createObjectStore('txos', { keyPath: ['txid', 'vout'] });
        txos.createIndex('events', 'events', { multiEntry: true });
        txos.createIndex('owner', 'owner');
        db.createObjectStore('txns', { keyPath: 'txid' });
      },
    });
  }

  async getTx(txid: string, fromRemote = false): Promise<Transaction | undefined> {
    let txn = await (await this.db).get('txns', txid);
    if (txn) {
      const tx = Transaction.fromBinary(Array.from(new Uint8Array(txn.rawtx)));
      tx.merklePath = MerklePath.fromBinary(Array.from(txn.proof));
      return tx;
    }
    if (!fromRemote) return;
    console.log('Fetching', txid);
    const [rawtx, proof] = await Promise.all([
      fetch(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}/bin`).then((resp) => resp.arrayBuffer()),
      fetch(`https://junglebus.gorillapool.io/v1/transaction/proof/${txid}`).then((resp) => resp.arrayBuffer()),
    ]);
    const tx = Transaction.fromBinary(Array.from(new Uint8Array(rawtx)));
    tx.merklePath = MerklePath.fromBinary(Array.from(new Uint8Array(proof)));
    txn = {
      txid,
      rawtx: new Uint8Array(rawtx),
      proof: new Uint8Array(proof),
      block: new Block(
        tx.merklePath.blockHeight,
        BigInt(tx.merklePath.path[0].find((p) => p.hash == txid)?.offset || 0),
      ),
      status: TxnStatus.CONFIRMED,
    };
    await (await this.db).put('txns', txn);
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
      if (results.txos.length >= limit) {
        console.timeEnd('findTxos');
        return results;
      }
    }
    delete results.nextPage;
    console.timeEnd('findTxos');
    return results;
  }

  async broadcast(tx: Transaction) {
    if (!this.broadcaster) throw new Error('No broadcaster configured');
    const resp = await this.broadcaster.broadcast(tx);
    if (resp.status == 'success') {
      await this.ingest(tx);
    }
    return resp;
  }

  async ingest(tx: Transaction, fromRemote = false): Promise<IndexContext> {
    const txid = tx.id('hex') as string;
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
    }

    const ctx: IndexContext = {
      txid,
      tx,
      block,
      spends: [],
      txos: [],
    };

    for (const input of tx.inputs) {
      if (!input.sourceTXID) input.sourceTXID = input.sourceTransaction!.id('hex') as string;
      if (input.sourceTransaction) {
        if (await (await this.db).getKey('txns', input.sourceTXID)) {
          continue;
        }
        await this.ingest(input.sourceTransaction);
      } else {
        input.sourceTransaction = await this.getTx(input.sourceTXID!, fromRemote);
        if (!input.sourceTransaction) throw new Error(`Failed to get source tx ${input.sourceTXID!}`);
      }
    }

    const t = (await this.db).transaction('txos', 'readwrite');
    for await (const [vin, input] of tx.inputs.entries()) {
      const data = await t.store.get([input.sourceTXID!, input.sourceOutputIndex]);
      const spend = data
        ? Txo.fromObject(data, this.indexers)
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
      if (!txo.owner) {
        txo.owner = parseAddress(output.lockingScript, 0);
      }

      txo.block = block;
      txo.events = [];
      ctx.txos.push(txo);
      this.indexers.forEach((i) => {
        const data = i.parse && i.parse(ctx, vout);
        if (data) {
          txo.data[i.tag] = data;
        }
      });
    }
    this.indexers.forEach((i) => i.save && i.save(ctx));
    for (const txo of ctx.txos) {
      txo.events = [];
      const spent = txo.spend ? '1' : '0';
      const sort = (txo.spend?.block?.height || txo.block?.height || Date.now()).toString(16).padStart(8, '0');
      if (txo.owner && this.addresses.has(txo.owner)) {
        Object.entries(txo.data).forEach(([tag, data]) => {
          data.events.forEach((e) => {
            txo.events.push(`${tag}:${e.id}:${e.value}:${spent}:${sort}:${txo.block?.idx}:${txo.vout}:${txo.satoshis}`);
          });
        });
      }
      t.store.put(txo);
    }
    await t.done;
    return ctx;
  }
}
