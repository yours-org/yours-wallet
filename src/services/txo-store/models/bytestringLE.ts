export class ByteStringLE {
  data: Uint8Array;
  constructor(data: string | Uint8Array) {
    if (typeof data === 'string') {
      this.data = Buffer.from(data, 'hex').reverse();
    } else {
      this.data = data;
    }
  }
  toString() {
    return Buffer.from(this.data).reverse().toString('hex');
  }
  toBytes() {
    return this.data;
  }

  toJSON() {
    return this.toString();
  }

  static fromJSON(json: string) {
    return new ByteStringLE(json);
  }
}
