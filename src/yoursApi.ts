/**
 * Types for the Yours wallet approval flow
 */

import type { CreateActionArgs } from '@1sat/actions';

// Approval context passed to the approval UI (used by service worker)
export interface ApprovalContext {
  requestId: string;
  type: YoursApprovalType;
  description: string;
  createActionParams: CreateActionArgs;
  // Reference from signableTransaction - used for signAction/abortAction
  walletReference?: string;
  // The signable transaction bytes (AtomicBEEF) for preview parsing
  signableTransactionBEEF?: number[];
  // Original request for context display
  originalRequest?: unknown;
}

export type YoursApprovalType =
  | 'sendBsv'
  | 'sendAllBsv'
  | 'transferOrdinal'
  | 'listOrdinal'
  | 'inscribe'
  | 'lockBsv';
