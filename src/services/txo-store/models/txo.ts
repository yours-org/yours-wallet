import { Block } from '../../block-store/block';
import { IndexData } from './index-data';
import type { Indexer } from './indexer';
import { Spend } from './spend';
import { Buffer } from 'buffer';

export enum TxoStatus {
  TRUSTED = 0,
  DEPENDENCY = 1,
  CONFIRMED = 2,
}

export class Txo {
  block = new Block();
  spend?: Spend;
  data: { [tag: string]: IndexData } = {};
  events: string[] = [];
  owner?: string;

  constructor(
    public txid: string,
    public vout: number,
    public satoshis: bigint,
    public script: number[],
    public status: TxoStatus,
  ) {}

  toObject(): any {
    this.events = [];
    const sort = this.block.height.toString(16).padStart(8, '0');
    if (!this.spend && this.status !== TxoStatus.DEPENDENCY) {
      for (const [tag, data] of Object.entries(this.data)) {
        for (const e of data.events) {
          this.events.push(`${tag}:${e.id}:${e.value}:${sort}:${this.block?.idx}:${this.vout}:${this.satoshis}`);
        }
      }
    }
    return this;
  }

  static fromObject(obj: any, indexers: Indexer[] = []): Txo {
    const txo = new Txo(obj.txid, obj.vout, obj.satoshis, obj.script, obj.status);
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
    txo.status = obj.status;
    return txo;
  }

  toJSON() {
    return {
      ...this,
      script: Buffer.from(this.script).toString('base64'),
      satoshis: this.satoshis.toString(),
      data: Object.entries(this.data).reduce((acc: { [tag: string]: any }, [tag, data]) => {
        acc[tag] = data.data;
        return acc;
      }, {}),
    };
  }
}

export class TxoLookup {
  constructor(
    public indexer: string,
    // public spent = false,
    public id?: string,
    public value?: string,
    public owner?: string,
  ) {}

  toQueryKey(): string {
    return TxoLookup.buildQueryKey(this.indexer, this.id, this.value);
  }

  static buildQueryKey(tag: string, id?: string, value?: string): string {
    let key = tag;
    if (id) {
      key += `:${id}`;
      if (value) {
        key += `:${value}`;
      }
    }
    return key;
  }
}

export interface TxoResults {
  txos: Txo[];
  nextPage?: string;
}
