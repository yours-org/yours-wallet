import { Utils } from '@bsv/sdk';
export class Outpoint {
  txid: number[];
  vout: number;

  constructor(txidOrOutpoint: string | number[], vout?: number) {
    const buf = typeof txidOrOutpoint == 'string' ? Utils.toArray(txidOrOutpoint, 'hex') : txidOrOutpoint;

    if (vout !== undefined) {
      this.txid = buf;
      this.vout = vout;
      return;
    }

    const reader = new Utils.Reader(buf);
    this.txid = reader.read(32).reverse();
    this.vout = reader.readInt32LE();
  }

  toString(): string {
    return `${Utils.toHex(this.txid)}_${this.vout}`;
  }

  toBytes(): number[] {
    const writer = new Utils.Writer();
    writer.write([...this.txid].reverse());
    writer.writeUInt32LE(this.vout);
    return writer.toArray();
  }

  toJSON() {
    return this.toString();
  }

  static fromJSON(json: string) {
    return new Outpoint(json);
  }

  // static fromProperties(txid: string | Uint8Array, vout: number) {
  //   if (typeof txid === 'string') {
  //     txid = Buffer.from(txid, 'hex');
  //   }
  //   return new Outpoint(txid);
  // }
}
