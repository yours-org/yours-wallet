export type { ScanResult, TokenBalance } from '@1sat/actions/dist/sweep/scan';
export type { SweepInput, SweepBsvResponse, SweepOrdinalsResponse, SweepBsv21Response } from '@1sat/actions/dist/sweep';

export type SweepStep = 'intro' | 'password' | 'scanning' | 'review' | 'sweeping' | 'results';

export interface SweepSelection {
  sweepBsv: boolean;
  bsvAmount?: number; // undefined = sweep all
  selectedOrdinals: Set<string>; // outpoints
  selectedBsv21TokenIds: Set<string>; // tokenIds
}

export interface SweepTxResult {
  type: 'bsv' | 'ordinals' | 'bsv21';
  label: string;
  txid?: string;
  error?: string;
}

export interface AddressScanStatus {
  address: string;
  label: string; // "Pay", "Ordinals", "Identity"
  status: 'pending' | 'scanning' | 'done' | 'error';
  error?: string;
}
