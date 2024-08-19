import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Script, Utils } from '@bsv/sdk';
import { MAINNET_ADDRESS_PREFIX, TESTNET_ADDRESS_PREFIX } from '../../../utils/constants';
import LockTemplate, { lockPrefix, lockSuffix } from '../template/lock';
import { NetWork, Ordinal } from 'yours-wallet-provider';
import { Txo, TxoStatus } from '../models/txo';
import { Event } from '../models/event';
import { TxoStore } from '../txo-store';
import { Ingest } from '../models/ingest';
import { Block } from '../../block-store/block';

const PREFIX = Buffer.from(lockPrefix, 'hex');
const SUFFIX = Buffer.from(lockSuffix, 'hex');

export class Lock {
  constructor(public until = 0) {}
}

export class LockIndexer extends Indexer {
  tag = 'lock';
  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const script = Buffer.from(txo.script);
    const prefixIdx = script.indexOf(PREFIX);
    if (prefixIdx === -1) return;
    const suffixIdx = script.indexOf(SUFFIX, prefixIdx + PREFIX.length);
    if (suffixIdx === -1) return;
    const dataScript = Script.fromBinary(Array.from(script.subarray(prefixIdx + PREFIX.length, suffixIdx)));
    if (dataScript.chunks[0]?.data?.length != 20 || !dataScript.chunks[1]?.data) return;
    const until = parseInt(Buffer.from(dataScript.chunks[1]!.data!).reverse().toString('hex'), 16);
    txo.owner = Utils.toBase58Check(dataScript.chunks[0].data!, [
      this.network === NetWork.Mainnet ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
    ]);
    const events: Event[] = [];
    if (txo.owner && this.owners.has(txo.owner)) {
      events.push({ id: 'until', value: until.toString().padStart(7, '0') });
      events.push({ id: 'address', value: txo.owner });
    }
    return new IndexData(new Lock(until), [], events);
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
          `https://ordinals.gorillapool.io/api/locks/address/${owner}/unspent?limit=${limit}&offset=${offset}`,
        );
        utxos = (await resp.json()) as Ordinal[];

        const ingests = utxos.map(
          (u) => new Ingest(u.txid, u.height, u.idx || 0, false, true, this.syncMode == TxoStatus.TRUSTED),
        );
        await txoStore.queue(ingests);

        const t = txoDb.transaction('txos', 'readwrite');
        for (const u of utxos) {
          if (!u.data?.lock || !u.data.lock.until) continue;
          const txo = new Txo(
            u.txid,
            u.vout,
            BigInt(u.satoshis),
            new LockTemplate().lock(owner, u.data.lock.until).toBinary(),
            TxoStatus.TRUSTED,
          );
          if (u.height) {
            txo.block = new Block(u.height, BigInt(u.idx || 0));
          }
          txo.data[this.tag] = new IndexData(
            new Lock(u.data.lock.until),
            [],
            [
              { id: 'until', value: u.data.lock.until.toString().padStart(7, '0') },
              { id: 'address', value: owner },
            ],
          );
          t.store.put(txo.toObject());
          lastHeight = Math.max(lastHeight, u.height || 0);
        }
        await t.done;
        offset += limit;
      } while (utxos.length == 100);
    }
    return lastHeight;
  }
}
