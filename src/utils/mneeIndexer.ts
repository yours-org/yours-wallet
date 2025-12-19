// TODO: Port MNEEIndexer to 1sat-wallet-toolbox
// The MNEEIndexer was a custom sync source for spv-store that fetched MNEE transactions
// from the MNEE API. The new wallet-toolbox uses SSE-based sync from 1Sat API.
//
// MNEE balance checking still works via @mnee/ts-sdk (mnee.balance()).
// MNEE transactions should still appear in sync if they're indexed by 1Sat.
//
// To re-enable, port to use wallet.ingest() for each MNEE transaction.

import axios from 'axios';
// import { Indexer, Ingest, ParseMode, TxoStore } from 'spv-store';
import { MNEE_API, MNEE_API_TOKEN } from './constants';

type TxResult = {
  txid: string;
  outputs: number[];
  height?: number;
  idx?: number;
  time?: number;
  hash?: string;
  score?: number;
  rawtx?: string;
  senders: string[];
  receivers: string[];
};

// TODO: Re-implement using OneSatWallet.ingest() instead of spv-store
// export class MNEEIndexer extends Indexer {
//   tag = 'mnee';
//   name = 'MNEE';
//
//   async sync(txoStore: TxoStore, ingestQueue: { [txid: string]: Ingest }): Promise<number> {
//     if (this.network !== 'mainnet') return 0;
//     const { data } = await axios.post<TxResult[]>(`${MNEE_API}/v1/sync?auth_token=${MNEE_API_TOKEN}`, [...this.owners]);
//     console.log('Syncing', data.length, 'mnee for ', [...txoStore.owners]);
//     let maxScore = 0;
//     for (const d of data) {
//       const ingest = ingestQueue[d.txid] || {
//         txid: d.txid,
//         height: d.height || Date.now(),
//         source: 'mnee',
//         idx: d.idx || 0,
//         parseMode: ParseMode.PersistSummary,
//       };
//       ingestQueue[d.txid] = ingest;
//
//       if (d.height && d.height < 50000000) {
//         maxScore = Math.max(maxScore, d.height * 1e9 + (d.idx || 0));
//       }
//     }
//     return maxScore;
//   }
// }

/**
 * Fetch MNEE transactions for the given addresses.
 * This can be used to manually sync MNEE transactions into the wallet.
 */
export async function fetchMNEETransactions(owners: Set<string>): Promise<TxResult[]> {
  const { data } = await axios.post<TxResult[]>(`${MNEE_API}/v1/sync?auth_token=${MNEE_API_TOKEN}`, [...owners]);
  return data;
}
