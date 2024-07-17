import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Ord } from './ord';

export class OpNSIndexer extends Indexer {
  tag = 'opns';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const ord = txo.data.ord?.data as Ord;
    if (!ord || ord.insc?.file.type !== 'application/op-ns') return;

    const data = new IndexData(ord.insc);
    return data;
  }
}
