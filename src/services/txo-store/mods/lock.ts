import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Script, Utils } from '@bsv/sdk';
import { MAINNET_ADDRESS_PREFIX, TESTNET_ADDRESS_PREFIX } from '../../../utils/constants';
import { lockPrefix, lockSuffix } from '../template/lock';

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
    const owner = Utils.toBase58Check(dataScript.chunks[0].data!, [
      this.network === 'mainnet' ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
    ]);
    const until = parseInt(Buffer.from(dataScript.chunks[1]!.data!).reverse().toString('hex'), 16);
    if (this.owners.has(owner)) {
      return new IndexData(
        new Lock(until),
        [],
        [
          { id: 'until', value: until.toString().padStart(7, '0') },
          { id: 'address', value: owner },
        ],
      );
    }
  }
}
