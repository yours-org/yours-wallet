import { BroadcastResponse, BroadcastFailure, Transaction } from '@bsv/sdk';
import { Txn } from './txo-store/models/txn';

export interface TransactionService {
  broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure>;
  status(txid: string): Promise<Txn | undefined>;
  fetch(txid: string): Promise<Txn | undefined>;
}
