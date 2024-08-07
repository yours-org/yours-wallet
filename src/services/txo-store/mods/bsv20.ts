import type { IndexContext } from '../models/index-context';
import { IndexData } from '../models/index-data';
import { Indexer } from '../models/indexer';
import { Ord } from './ord';

export class Bsv20 {
  status = 0;
  public tick = '';
  public op = '';
  public amt = 0n;
  public dec = 0;
  public reason?: string;
  public fundAddress = '';

  toJSON() {
    return {
      ...this,
      amt: this.amt.toString(),
    };
  }

  static fromJSON(obj: any): Bsv20 {
    const bsv20 = new Bsv20();
    Object.assign(bsv20, {
      ...obj,
      amt: BigInt(obj.amt),
    });
    return bsv20;
  }
}

export class Bsv20Indexer extends Indexer {
  tag = 'bsv20';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const ord = txo.data.ord?.data as Ord;
    if (!ord || ord.insc?.file.type !== 'application/bsv-20') return;
    try {
      const bsv20 = Bsv20.fromJSON(JSON.parse(ord.insc!.file.text!));
      const data = new IndexData(bsv20);
      const amt = BigInt(bsv20.amt);
      if (amt <= 0n || amt > 2 ** 64 - 1) return;
      switch (bsv20.op) {
        case 'deploy':
          if (bsv20.dec || 0 > 18) return;
          break;
        case 'mint':
        case 'transfer':
        case 'burn':
          break;
        default:
          return;
      }
      if (!bsv20.tick) {
        return;
      }
      data.events.push({ id: 'tick', value: bsv20.tick });
      return data;
    } catch (e) {
      return;
    }
  }

  fromObj(obj: IndexData): IndexData {
    return new IndexData(Bsv20.fromJSON(obj.data), obj.deps);
  }
}
