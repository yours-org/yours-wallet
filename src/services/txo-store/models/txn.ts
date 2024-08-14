import type { Block } from './block';
import { TxoStatus } from './txo';

export enum TxnStatus {
  INVALID = -1,
  PENDING = 0,
  BROADCASTED = 1,
  DOWNLOAD = 2,
  INGEST = 3,
  CONFIRMED = 4,
  IMMUTABLE = 5,
}

export interface Txn {
  txid: string;
  rawtx: number[];
  proof?: number[];
  block: Block;
  status: TxnStatus;
}

export interface TxnStatusResponse {
  status: TxnStatus;
  proof?: number[];
  message?: string;
}
export class TxnIngest {
  status = TxnStatus.DOWNLOAD;
  constructor(
    public txid: string,
    public height: number,
    public idx: number,
    public isDep = false,
  ) {}
}
