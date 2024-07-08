export interface BlockHeader {
  hash: string;
  height: number;
  prevHash: string;
  time: number;
  merkleroot: string;
  bits: number;
  nonce: number;
}
