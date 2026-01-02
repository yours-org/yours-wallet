/**
 * YoursApi - Yours wallet API with custom approval UI
 *
 * This is a thin wrapper that posts messages to the service worker.
 * The service worker handles transaction building, approval flow, and signing.
 *
 * Unlike direct OneSatApi calls (which use WalletPermissionsManager),
 * YoursApi shows a custom transaction preview before executing.
 */

import type {
  SendBsvRequest,
  SendBsvResponse,
  TransferOrdinalRequest,
  OrdinalOperationResponse,
  ListOrdinalRequest,
  InscribeRequest,
  LockBsvRequest,
  CreateActionArgs,
} from '@1sat/wallet-toolbox';
import { CustomListenerName, YoursEventName, type ResponseEventDetail } from './inject';

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

/**
 * Helper to create YoursApi methods that post to service worker
 */
function createYoursApiMethod<TRequest, TResponse>(eventType: YoursEventName) {
  return async (request: TRequest): Promise<TResponse> => {
    return new Promise((resolve, reject) => {
      const messageId = `${eventType}-${Date.now()}-${Math.random()}`;

      const requestEvent = new CustomEvent(CustomListenerName.YOURS_REQUEST, {
        detail: {
          messageId,
          type: eventType,
          params: { data: request },
        },
      });

      function onResponse(e: Event) {
        const responseEvent = e as CustomEvent<ResponseEventDetail>;
        const { detail } = responseEvent;
        if (detail.success) {
          resolve(detail.data as TResponse);
        } else {
          // Return error response instead of rejecting for compatibility
          resolve({ error: detail.error || 'unknown-error' } as TResponse);
        }
      }

      self.addEventListener(messageId, onResponse, { once: true });
      self.dispatchEvent(requestEvent);
    });
  };
}

/**
 * YoursApi provides the same methods as OneSatApi but with custom approval UI.
 *
 * This is a thin wrapper - all transaction logic happens in the service worker.
 * Browser-land posts messages, service worker builds tx, shows approval, signs/aborts.
 *
 * Usage:
 * ```typescript
 * const yoursApi = createYoursApi(oneSatApi);
 * const result = await yoursApi.sendBsv([{ address, satoshis }]);
 * // ^ Shows approval popup before executing
 * ```
 */
export class YoursApi {
  constructor(private oneSatApi: OneSatApi) {}

  // ============ Transactional Methods (go through service worker with approval) ============

  sendBsv = createYoursApiMethod<SendBsvRequest[], SendBsvResponse>(YoursEventName.YOURS_SEND_BSV);
  sendAllBsv = createYoursApiMethod<string, SendBsvResponse>(YoursEventName.YOURS_SEND_ALL_BSV);
  transferOrdinal = createYoursApiMethod<TransferOrdinalRequest, OrdinalOperationResponse>(YoursEventName.YOURS_TRANSFER_ORDINAL);
  listOrdinal = createYoursApiMethod<ListOrdinalRequest, OrdinalOperationResponse>(YoursEventName.YOURS_LIST_ORDINAL);
  inscribe = createYoursApiMethod<InscribeRequest, OrdinalOperationResponse>(YoursEventName.YOURS_INSCRIBE);
  lockBsv = createYoursApiMethod<LockBsvRequest[], SendBsvResponse>(YoursEventName.YOURS_LOCK_BSV);

  // ============ Read-only methods (delegate to OneSatApi directly) ============
  // These don't need approval since they don't spend funds

  getBalance = () => this.oneSatApi.getBalance();
  getPaymentUtxos = () => this.oneSatApi.getPaymentUtxos();
  getOrdinals = (limit?: number, offset?: number) => this.oneSatApi.listOrdinals({ limit, offset });
  getBsv21s = () => this.oneSatApi.getBsv21Balances();
  getLockData = () => this.oneSatApi.getLockData();
  getExchangeRate = () => this.oneSatApi.getExchangeRate();
  getContentUrl = (outpoint: string) => this.oneSatApi.getContentUrl(outpoint);
  getBlockHeight = () => this.oneSatApi.getBlockHeight();
}

// Import OneSatApi type for read-only methods
import type { OneSatApi } from '@1sat/wallet-toolbox';

/**
 * Factory function to create YoursApi
 */
export function createYoursApi(oneSatApi: OneSatApi): YoursApi {
  return new YoursApi(oneSatApi);
}
