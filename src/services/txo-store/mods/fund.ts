import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { parseAddress } from '../models/address';

export class FundIndexer extends Indexer {
  tag = 'fund';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;
    const address = parseAddress(script, 0);
    if (address && txo.satoshis > 1n) {
      return new IndexData(address, [], [{ id: 'address', value: address }]);
    }
    return;
  }
}
