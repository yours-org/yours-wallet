import { Buffer } from 'buffer';
export class Outpoint {
  txid: Uint8Array;
  vout: number;

  constructor(txidOrOutpoint: string | Uint8Array, vout?: number) {
    const buf = typeof txidOrOutpoint == 'string' ? new Uint8Array(Buffer.from(txidOrOutpoint, 'hex')) : txidOrOutpoint;

    if (vout !== undefined) {
      this.txid = buf;
      this.vout = vout;
      return;
    }

    this.txid = buf.slice(0, 32);
    const view = new DataView(buf.buffer);
    this.vout = view.getUint32(32, true);
  }

  toString(): string {
    return `${Buffer.from(this.txid).reverse().toString('hex')}_${this.vout}`;
  }

  txidString(): string {
    return Buffer.from(this.txid).reverse().toString('hex');
  }

  toBytes(): Uint8Array {
    const b = Buffer.alloc(36);
    Buffer.from(this.txid).copy(b, 0);
    b.writeUInt32LE(this.vout, 32);
    return b;
  }

  toJSON() {
    return this.toString();
  }

  static fromJSON(json: string) {
    return new Outpoint(json);
  }

  static fromProperties(txid: string | Uint8Array, vout: number) {
    if (typeof txid === 'string') {
      txid = Buffer.from(txid, 'hex');
    }
    return new Outpoint(txid);
  }
}
