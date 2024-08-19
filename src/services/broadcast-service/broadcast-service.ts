import { BroadcastFailure, BroadcastResponse, Transaction } from '@bsv/sdk';

export enum BroadcastStatus {
  REJECTED = -1,
  MEMPOOL = 0,
  BROADCASTED = 1,
  CONFIRMED = 2,
}

export interface BroadcastStatusResponse {
  status: BroadcastStatus;
  proof?: number[];
  message?: string;
}

export interface BroadcastService {
  broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure>;
  status(txid: string): Promise<BroadcastStatusResponse | undefined>;
}
