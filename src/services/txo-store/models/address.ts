import { OP, Utils, type Script } from '@bsv/sdk';

export function parseAddress(script: Script, offset = 0): string {
  if (
    script.chunks[0 + offset]?.op === OP.OP_DUP &&
    script.chunks[1 + offset]?.op === OP.OP_HASH160 &&
    script.chunks[2 + offset]?.data?.length === 20 &&
    script.chunks[3 + offset]?.op === OP.OP_EQUALVERIFY &&
    script.chunks[4 + offset]?.op === OP.OP_CHECKSIG
  ) {
    return Utils.toBase58Check(script.chunks[2 + offset].data!, [0]);
  }
  return '';
}
