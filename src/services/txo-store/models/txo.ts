import { Block } from './block';
import { IndexData } from './index-data';
import type { Indexer } from './indexer';
import { Spend } from './spend';
import { Buffer } from 'buffer';

export class Txo {
  block?: Block;
  spend?: Spend;
  data: { [tag: string]: IndexData } = {};
  events: string[] = [];
  owner?: string;

  constructor(
    public txid: string,
    public vout: number,
    public satoshis: bigint,
    public script: Uint8Array,
  ) {}

  static fromObject(obj: any, indexers: Indexer[] = []): Txo {
    const txo = new Txo(obj.txid, obj.vout, obj.satoshis, obj.script);
    txo.block = obj.block && new Block(obj.block.height, obj.block.idx, obj.block.hash);
    txo.spend =
      obj.spend &&
      new Spend(
        obj.spend.txid,
        obj.spend.vin,
        obj.spend.block && new Block(obj.spend.block.height, obj.spend.block.idx, obj.spend.block.hash),
      );
    txo.owner = obj.owner;
    for (const idx of indexers) {
      if (obj.data[idx.tag]) {
        txo.data[idx.tag] = idx.fromObj(obj.data[idx.tag]);
      }
    }

    txo.events = obj.events;
    return txo;
  }

  toJSON() {
    return {
      ...this,
      script: Buffer.from(this.script).toString('base64'),
      satoshis: this.satoshis.toString(),
      owner: this.owner,
      data: Object.entries(this.data).reduce((acc: { [tag: string]: any }, [tag, data]) => {
        acc[tag] = data.data;
        return acc;
      }, {}),
      events: this.events,
    };
  }
}

export class TxoLookup {
  constructor(
    public indexer: string,
    public id?: string,
    public value?: string,
    public spent?: boolean,
    public owner?: string,
  ) {}

  toQueryKey(): string {
    return TxoLookup.buildQueryKey(this.indexer, this.id, this.value, this.spent);
  }

  static buildQueryKey(tag: string, id?: string, value?: string, spent?: boolean): string {
    let key = `${tag}`;
    if (id) {
      key += `:${id}`;
      if (value) {
        key += `:${value}`;
        if (spent !== undefined) {
          key += `:${spent ? '1' : '0'}`;
        }
      }
    }
    return key;
  }
}

export interface TxoResults {
  txos: Txo[];
  nextPage?: string;
}
