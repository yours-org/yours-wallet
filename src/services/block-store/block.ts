export class Block {
  constructor(
    public height = Date.now(),
    public idx = 0n,
    public hash = '',
  ) {}

  toJSON() {
    return {
      height: this.height,
      idx: this.idx.toString(),
      hash: this.hash,
    };
  }
}
