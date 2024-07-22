import type { Block } from './block';

export enum TxnStatus {
  INVALID = -1,
  PENDING = 0,
  BROADCASTED = 1,
  INGEST = 2,
  CONFIRMED = 3,
  IMMUTABLE = 4,
}

export interface Txn {
  txid: string;
  rawtx: Uint8Array;
  proof?: Uint8Array;
  block: Block;
  status: TxnStatus;
}
