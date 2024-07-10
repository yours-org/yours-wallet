export class Listing {
  constructor(
    public payout = new Uint8Array(0),
    public price = 0n,
  ) {}

  toJSON() {
    return {
      payout: Buffer.from(this.payout).toString('base64'),
      price: this.price.toString(),
    };
  }
}
