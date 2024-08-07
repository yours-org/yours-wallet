import { Block } from './block';

export class Spend {
  constructor(
    public txid: string,
    public vin: number,
    public block = new Block(),
  ) {}

  toJSON() {
    return {
      txid: this.txid,
      vin: this.vin,
      block: this.block?.toJSON(),
    };
  }
}
