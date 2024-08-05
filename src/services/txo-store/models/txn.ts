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

export interface TxnStatusResponse {
  status: TxnStatus;
  proof?: Uint8Array;
  message?: string;
}
export class TxnIngest {
  status = TxnStatus.INGEST;
  constructor(
    public txid: string,
    public height: number,
    public idx: number,
  ) {}
}
