import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { parseAddress } from '../models/address';
import { TxoStore } from '..';
import { Txo, TxoStatus } from '../models/txo';
import { Ordinal, Utxo } from 'yours-wallet-provider';
import { P2PKH, Utils } from '@bsv/sdk';
import { TxnIngest } from '../models/txn';
import { Block } from '../models/block';

export class FundIndexer extends Indexer {
  tag = 'fund';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;
    const address = parseAddress(script, 0);
    if (address && txo.satoshis > 1n && this.owners.has(address)) {
      txo.owner = address;
      return new IndexData(address, [], [{ id: 'address', value: address }]);
    }
    return;
  }
  async sync(txoStore: TxoStore): Promise<void> {
    const limit = 10000;
    const txoDb = await txoStore.txoDb;
    for await (const owner of this.owners) {
      let offset = 0;
      let utxos: Ordinal[] = [];
      do {
        const resp = await fetch(
          `https://ordinals.gorillapool.io/api/txos/address/${owner}/unspent?limit=${limit}&offset=${offset}`,
        );
        utxos = await resp.json();
        const txns = utxos.map((u) => new TxnIngest(u.txid, u.height, u.idx, false));
        await txoStore.queue(txns);
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
            TxoStatus.Assumed,
          );
          if (u.height) {
            txo.block = new Block(u.height, BigInt(u.idx || 0));
          }
          txo.data[this.tag] = new IndexData(owner, [], [{ id: 'address', value: owner }]);
          const txoData = txo.toObject();
          await t.store.put(txoData);
        }
        await t.done;
        offset += limit;
      } while (utxos.length == 100);
    }
  }
}
