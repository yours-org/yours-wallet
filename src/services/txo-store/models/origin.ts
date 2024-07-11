export class Origin {
  constructor(
    public outpoint: string,
    public nonce: number,
    public data: { [key: string]: any } = {},
  ) {}
}
