import type { Transaction } from '@bsv/sdk';
import type { Outpoint } from './Outpoint';

/**
 * BSV21 token data structure from overlay API
 */
export interface Bsv21TokenData {
  id: string;
  op: string;
  amt: string; // Stored as string in overlay to avoid BSON type conversion issues
  sym?: string;
  dec?: number;
  icon?: string;
  address?: string;
}

/**
 * BSV21 output data from overlay API
 */
export interface Bsv21OutputData {
  txid: string;
  vout: number;
  data: {
    bsv21: Bsv21TokenData;
  };
  script: string;
  satoshis: number;
  spend: string | null;
  score: number;
}

/**
 * BSV21 transaction data from overlay API
 */
export interface Bsv21TransactionData {
  txid: string;
  inputs: Bsv21OutputData[];
  outputs: Bsv21OutputData[];
  beef?: string;
}

/**
 * IndexData contains the parsed data and tags from an indexer
 * Tags are concatenated strings in the format "key:value" for searchability
 */
export interface IndexData {
  data: any;
  tags: string[];
}

/**
 * IndexSummary contains transaction-level summary information
 */
export interface IndexSummary {
  id?: string;
  amount?: number;
  icon?: string;
  data?: any;
}

/**
 * Minimal transaction output structure used during parsing
 */
export interface Txo {
  satoshis: bigint;
  script: number[];
  owner?: string;
  basket?: string;
  data: { [tag: string]: IndexData };
  outpoint: Outpoint;
}

/**
 * Minimal context structure for indexer parsing
 */
export interface ParseContext {
  tx: Transaction;
  txid: string;
  txos: Txo[];
  spends: Txo[];
  summary: { [tag: string]: IndexSummary };
  indexers: Indexer[];
}

/**
 * Base indexer class that all indexers extend
 */
export abstract class Indexer {
  abstract tag: string;
  abstract name: string;

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {}

  /**
   * Parses an output and returns the index data if it is relevant to this indexer.
   * If the output is not relevant, it returns undefined.
   */
  abstract parse(ctx: ParseContext, vout: number, isBroadcasted: boolean): Promise<IndexData | undefined>;

  /**
   * Evaluates the index data for the entire transaction and returns a summary.
   */
  async summerize(ctx: ParseContext, isBroadcasted: boolean): Promise<IndexSummary | undefined> {
    return undefined;
  }
}
