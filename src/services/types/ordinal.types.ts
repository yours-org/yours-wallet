/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bsv20, Ordinal } from 'yours-wallet-provider';

export type OrdinalResponse = Ordinal[];

export type OrdOperationResponse = {
  txid?: string;
  error?: string;
};

export type ChangeInfo = { change: number; changeVout: number };

export type BuildAndBroadcastResponse = {
  txid: string;
  rawTx: string;
  changeInfo: ChangeInfo;
};

export type GPArcResponse = {
  blockHash: string;
  blockHeight: number;
  extraInfo: string;
  status: number;
  timestamp: string;
  title: string;
  txStatus: string;
  txid: string;
};

export type ListOrdinal = {
  outpoint: string;
  price: number;
  password: string;
};

// export interface BSV20Data {
//   initialized: boolean;
//   data: Bsv20[];
// }

// export interface OrdinalData {
//   initialized: boolean;
//   data: Ordinal[];
// }
