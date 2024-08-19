import { Transaction } from '@bsv/sdk';

export interface TxnService {
  fetch(txid: string): Promise<Transaction>;
  batchFetch(txids: string[]): Promise<Transaction[]>;
}
