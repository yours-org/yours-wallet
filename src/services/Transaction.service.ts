import { BroadcastResponse, BroadcastFailure, Transaction } from '@bsv/sdk';
import { Block } from './txo-store/models/block';

export interface TransactionService {
  broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure>;
  status(txid: string): Promise<Block | undefined>;
}
