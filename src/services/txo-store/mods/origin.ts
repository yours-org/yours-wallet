import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Origin } from '../models/origin';

export class OriginIndexer extends Indexer {
  tag: string = 'origin';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    if (ctx.txos[vout].satoshis != 1n) return;

    let outSat = 0n;
    for (let i = 0; i < vout; i++) {
      outSat += ctx.txos[i].satoshis;
    }
    let inSat = 0n;
    const data = new IndexData();
    let origin: Origin | undefined;
    for (const spend of ctx.spends) {
      data.deps.push(`${spend.txid}_${spend.vout}`);
      if (inSat == outSat && spend.satoshis == 1n) {
        if (spend.data.origin) {
          origin = Object.assign({}, spend.data.origin.data) as Origin;
          origin.nonce++;
        }
        break;
      } else if (inSat > outSat) {
        break;
      }
      inSat += spend.satoshis;
    }
    if (!origin) {
      origin = new Origin(`${txo.txid}_${txo.vout}`, 0);
    }

    if (origin) {
      origin.data.insc = txo.data.insc?.data;
      origin.data.opns = txo.data.opns?.data;
      if (txo.data.map) {
        origin.data.map = Object.assign(origin.data?.map || {}, txo.data.map.data);
      }
      data.events.push({ id: 'outpoint', value: origin.outpoint });
      data.data = origin;
      return data;
    }

    return;
  }
}
