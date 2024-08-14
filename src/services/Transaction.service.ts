import { BroadcastResponse, BroadcastFailure, Transaction } from '@bsv/sdk';
import { Txn, TxnStatusResponse } from './txo-store/models/txn';

export interface TransactionService {
  broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure>;
  status(txid: string): Promise<TxnStatusResponse | undefined>;
  fetch(txid: string): Promise<Transaction>;
  batchFetch(txids: string[]): Promise<Transaction[]>;
}
