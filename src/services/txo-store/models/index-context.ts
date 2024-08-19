import type { Transaction } from '@bsv/sdk';
import type { Txo } from './txo';
import { Block } from '../../block-store/block';

export interface IndexContext {
  tx: Transaction;
  txid: string;
  block?: Block;
  spends: Txo[];
  txos: Txo[];
}
