import type { IndexContext } from './index-context';
import { IndexData } from './index-data';

export abstract class Indexer {
  tag = '';

  constructor(public addresses = new Set<string>()) {}

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    return;
  }

  save(ctx: IndexContext): void {
    return;
  }

  static parseEvent(event: string) {
    const [tag, id, value, spent, sort, idx, vout, satoshis] = event.split(':');
    return {
      tag,
      id,
      value,
      spent: spent === '1',
      sort: parseInt(sort, 16),
      idx: parseInt(idx),
      vout: parseInt(vout),
      satoshis: BigInt(satoshis),
    };
  }

  fromObj(obj: IndexData): IndexData {
    return obj;
  }
}
