import type { Transaction } from '@bsv/sdk';
import type { Block } from './block';
import type { Txo } from './txo';

export interface IndexContext {
  tx: Transaction;
  txid: string;
  block?: Block;
  spends: Txo[];
  txos: Txo[];
}
