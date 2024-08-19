import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { parseAddress } from '../models/address';
import { Txo, TxoStatus } from '../models/txo';
import { Ordinal } from 'yours-wallet-provider';
import { P2PKH, Utils } from '@bsv/sdk';
import { Event } from '../models/event';
import { TxoStore } from '../txo-store';
import { Ingest } from '../models/ingest';
import { Block } from '../../block-store/block';

export class FundIndexer extends Indexer {
  tag = 'fund';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;
    const address = parseAddress(script, 0);
    if (txo.satoshis < 2n) return;
    const events: Event[] = [];
    if (address && this.owners.has(address)) {
      txo.owner = address;
      events.push({ id: 'address', value: address });
    }
    return new IndexData(address, [], events);
  }
  async sync(txoStore: TxoStore): Promise<number> {
    const limit = 10000;
    const txoDb = await txoStore.txoDb;
    let lastHeight = 0;
    for await (const owner of this.owners) {
      let offset = 0;
      let utxos: Ordinal[] = [];
      do {
        const resp = await fetch(
          `https://ordinals.gorillapool.io/api/txos/address/${owner}/unspent?limit=${limit}&offset=${offset}`,
        );
        utxos = await resp.json();
        const ingests = utxos.map(
          (u) => new Ingest(u.txid, u.height, u.idx || 0, false, true, this.syncMode == TxoStatus.TRUSTED),
        );
        await txoStore.queue(ingests);

        const t = txoDb.transaction('txos', 'readwrite');
        for (const u of utxos) {
          if (u.satoshis <= 1) {
            continue;
          }
          const txo = new Txo(
            u.txid,
            u.vout,
            BigInt(u.satoshis),
            new P2PKH().lock(Utils.fromBase58Check(owner).data).toBinary(),
            TxoStatus.TRUSTED,
          );
          txo.owner = owner;
          if (u.height) {
            txo.block = new Block(u.height, BigInt(u.idx || 0));
          }
          txo.data[this.tag] = new IndexData(owner, [], [{ id: 'address', value: owner }]);
          await t.store.put(txo.toObject());
          lastHeight = Math.max(lastHeight, u.height || 0);
        }
        await t.done;
        offset += limit;
      } while (utxos.length == 100);
    }
    return lastHeight;
  }
}
