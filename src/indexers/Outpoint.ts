import { Utils } from '@bsv/sdk';
export class Outpoint {
  txid: string;
  vout: number;

  constructor(txidOrOutpoint: string | number[] | Outpoint, vout?: number) {
    if (vout !== undefined) {
      this.vout = vout;
      if (typeof txidOrOutpoint == 'string') {
        this.txid = txidOrOutpoint;
      } else if (Array.isArray(txidOrOutpoint)) {
        this.txid = Utils.toHex(txidOrOutpoint);
      } else {
        throw new Error('Invalid Outpoint');
      }
    } else if (Array.isArray(txidOrOutpoint)) {
      const reader = new Utils.Reader(txidOrOutpoint);
      this.txid = Utils.toHex(reader.read(32).reverse());
      this.vout = reader.readInt32LE();
    } else if (typeof txidOrOutpoint == 'string') {
      const [txid, vout] = txidOrOutpoint.split('_');
      this.txid = txid;
      this.vout = parseInt(vout);
    } else if (typeof txidOrOutpoint == 'object') {
      this.txid = txidOrOutpoint.txid;
      this.vout = txidOrOutpoint.vout;
    } else {
      throw new Error('Invalid Outpoint');
    }
  }

  toString(): string {
    return `${this.txid}_${this.vout}`;
  }

  toBinary(): number[] {
    const writer = new Utils.Writer();
    writer.write(Utils.toArray(this.txid, 'hex').reverse());
    writer.writeUInt32LE(this.vout);
    return writer.toArray();
  }

  toBEBinary(): number[] {
    const writer = new Utils.Writer();
    writer.write(Utils.toArray(this.txid, 'hex'));
    writer.writeUInt32BE(this.vout);
    return writer.toArray();
  }

  toJSON(): string {
    return this.toString();
  }
}
