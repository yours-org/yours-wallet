// Import CWI to inject window.CWI (BRC-100 WalletInterface)
import './cwi';
import { CWI } from './cwi';
import { OneSatApi } from '@1sat/wallet-toolbox';
import type {
  ListOutputsResult,
  GetPublicKeyResult,
  GetNetworkResult,
  GetHeightResult,
  GetHeaderResult,
  GetVersionResult,
  ListActionsResult,
  CreateSignatureResult,
  VerifySignatureResult,
  CreateActionResult,
  SignActionResult,
  AbortActionResult,
  WalletEncryptResult,
  WalletDecryptResult,
} from '@bsv/sdk';

import {
  Addresses,
  Balance,
  Broadcast,
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  GetTaggedKeysRequest,
  InscribeRequest,
  NetWork,
  PubKeys,
  PurchaseOrdinal,
  SendBsv,
  SendBsvResponse,
  SignatureResponse,
  SignedMessage,
  SignMessage,
  SocialProfile as YoursSocialProfile,
  TaggedDerivationRequest,
  TaggedDerivationResponse,
  TransferOrdinal,
  Utxo,
  YoursEventListeners,
  YoursEvents,
  YoursProviderType,
  Bsv20,
  SendBsv20Response,
  SendBsv20,
  SendMNEEResponse,
  SendMNEE,
  MNEEBalance,
  LockRequest,
} from 'yours-wallet-provider';

export enum YoursEventName {
  CONNECT = 'connectRequest',
  DISCONNECT = 'disconnect',
  IS_CONNECTED = 'isConnected',
  GET_PUB_KEYS = 'getPubKeys',
  GET_LEGACY_ADDRESSES = 'getLegacyAddresses',
  GET_RECEIVE_ADDRESS = 'getReceiveAddress',
  GET_NETWORK = 'getNetwork',
  GET_BALANCE = 'getBalance',
  GET_MNEE_BALANCE = 'getMNEEBalance',
  GET_BSV20S = 'getBsv20s',
  SEND_BSV = 'sendBsvRequest',
  SEND_BSV20 = 'sendBsv20Request',
  SEND_MNEE = 'sendMNEERequest',
  TRANSFER_ORDINAL = 'transferOrdinalRequest',
  SIGN_MESSAGE = 'signMessageRequest',
  BROADCAST = 'broadcastRequest',
  GET_SIGNATURES = 'getSignaturesRequest',
  GET_SOCIAL_PROFILE = 'getSocialProfile',
  GET_PAYMENT_UTXOS = 'getPaymentUtxos',
  GET_EXCHANGE_RATE = 'getExchangeRate',
  PURCHASE_ORDINAL = 'purchaseOrdinalRequest',
  PURCHASE_BSV20 = 'purchaseOrdinalRequest',
  GENERATE_TAGGED_KEYS = 'generateTaggedKeysRequest',
  GET_TAGGED_KEYS = 'getTaggedKeys',
  INSCRIBE = 'sendBsvRequest',
  LOCK_BSV = 'sendBsvRequest',
  ENCRYPT = 'encryptRequest',
  DECRYPT = 'decryptRequest',
  SIGNED_OUT = 'signedOut',
  USER_CONNECT_RESPONSE = 'userConnectResponse',
  SEND_BSV_RESPONSE = 'sendBsvResponse',
  SEND_BSV20_RESPONSE = 'sendBsv20Response',
  SEND_MNEE_RESPONSE = 'sendMNEEResponse',
  TRANSFER_ORDINAL_RESPONSE = 'transferOrdinalResponse',
  PURCHASE_ORDINAL_RESPONSE = 'purchaseOrdinalResponse',
  SIGN_MESSAGE_RESPONSE = 'signMessageResponse',
  BROADCAST_RESPONSE = 'broadcastResponse',
  GET_SIGNATURES_RESPONSE = 'getSignaturesResponse',
  GENERATE_TAGGED_KEYS_RESPONSE = 'generateTaggedKeysResponse',
  ENCRYPT_RESPONSE = 'encryptResponse',
  DECRYPT_RESPONSE = 'decryptResponse',
  SYNC_UTXOS = 'syncUtxos', // This is not exposed on the provider
  SYNC_STATUS_UPDATE = 'syncStatusUpdate', // This is not exposed on the provider
  BLOCK_HEIGHT_UPDATE = 'blockHeightUpdate', // This is not exposed on the provider
  SWITCH_ACCOUNT = 'switchAccount', // This is not exposed on the provider

  // YoursApi transactional methods (with custom approval UI)
  YOURS_SEND_BSV = 'yoursSendBsv',
  YOURS_SEND_ALL_BSV = 'yoursSendAllBsv',
  YOURS_TRANSFER_ORDINAL = 'yoursTransferOrdinal',
  YOURS_LIST_ORDINAL = 'yoursListOrdinal',
  YOURS_INSCRIBE = 'yoursInscribe',
  YOURS_LOCK_BSV = 'yoursLockBsv',
  // Approval response from popup
  TRANSACTION_APPROVAL_RESPONSE = 'transactionApprovalResponse',
}

export enum CustomListenerName {
  YOURS_EMIT_EVENT = 'YoursEmitEvent',
  YOURS_REQUEST = 'YoursRequest',
  YOURS_RESPONSE = 'YoursResponse',
}

export type RequestParams = {
  appName?: string;
  appIcon?: string;
  data?:
    | SendBsv[]
    | SendBsv20
    | SendMNEE[]
    | InscribeRequest[]
    | LockRequest[]
    | TransferOrdinal
    | PurchaseOrdinal
    | SignMessage
    | Broadcast
    | GetSignatures
    | TaggedDerivationRequest
    | EncryptRequest
    | DecryptRequest;
  domain?: string;
  isAuthorized?: boolean;
};

export type RequestEventDetail = {
  messageId: string;
  type: YoursEventName;
  params: RequestParams;
};

export type RequestEvent = {
  detail: RequestEventDetail;
};

export type SerializedBsv20 = Omit<Bsv20, 'listed' | 'all'> & {
  listed: { confirmed: string; pending: string };
  all: { confirmed: string; pending: string };
};

export type ResponseEventDetail = {
  type: YoursEventName | string; // string to support CWI event names
  success: boolean;
  data?: (
    | ConnectResponse
    | SendBsvResponse
    | SendBsv20Response
    | SendMNEEResponse
    | PubKeys
    | Addresses
    | NetWork
    | Balance
    | MNEEBalance
    | Bsv20[]
    | SerializedBsv20[]
    | SignatureResponse[]
    | YoursSocialProfile
    | TaggedDerivationResponse
    | TaggedDerivationResponse[]
    | SignedMessage
    | Utxo[]
    | boolean
    | string
    | number
    | string[]
    | undefined
    // CWI (BRC-100) result types
    | ListOutputsResult
    | GetPublicKeyResult
    | GetNetworkResult
    | GetHeightResult
    | GetHeaderResult
    | GetVersionResult
    | { authenticated: boolean } // AuthenticatedResult only types {authenticated: true}
    | ListActionsResult
    | CreateSignatureResult
    | VerifySignatureResult
    | CreateActionResult
    | SignActionResult
    | AbortActionResult
    | WalletEncryptResult
    | WalletDecryptResult
    | { valid: boolean } // VerifyHmacResult
  ) & { popupId?: number };
  error?: string | undefined | boolean;
};

export type ResponseEvent = {
  detail: ResponseEventDetail;
};

export type EmitEventDetail = {
  type: CustomListenerName.YOURS_EMIT_EVENT;
  action: YoursEventName;
  params: RequestParams;
};

export type EmitEvent = {
  detail: EmitEventDetail;
};

export type WhitelistedApp = {
  domain: string;
  icon: string;
};

export type Decision = 'approved' | 'declined';
export type ConnectResponse = { decision: Decision; pubKeys: PubKeys };

// Helper to create yours extension methods via postMessage
const createYoursMethod = <T, P = RequestParams>(type: YoursEventName) => {
  return async (params?: P) => {
    return new Promise<T>((resolve, reject) => {
      const messageId = `${type}-${Date.now()}-${Math.random()}`;
      const requestEvent = new CustomEvent(CustomListenerName.YOURS_REQUEST, {
        detail: { messageId, type, params },
      });

      function onResponse(e: Event) {
        const responseEvent = e as CustomEvent<ResponseEventDetail>;
        const { detail } = responseEvent;
        if (detail.type === type) {
          if (detail.success) {
            resolve(detail.data as T);
          } else {
            reject(detail.error);
          }
        }
      }

      self.addEventListener(messageId, onResponse, { once: true });
      self.dispatchEvent(requestEvent);
    });
  };
};

// Event emitter for yours-specific events
const whitelistedEvents: string[] = [YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT];

const createYoursEventEmitter = () => {
  const eventListeners = new Map<string, YoursEventListeners[]>();

  const on = (eventName: YoursEvents, callback: YoursEventListeners) => {
    if (whitelistedEvents.includes(eventName)) {
      if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, []);
      }
      eventListeners.get(eventName)?.push(callback);
    } else {
      console.error('Event name is not whitelisted:', eventName);
    }
  };

  const removeListener = (eventName: YoursEvents, callback: YoursEventListeners) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      eventListeners.set(
        eventName,
        listeners.filter((fn) => fn !== callback),
      );
    }
  };

  const emit = (eventName: YoursEvents, params: RequestParams) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((callback) => callback(params));
    }
  };

  return { on, removeListener, emit };
};

const { on, removeListener, emit } = createYoursEventEmitter();

// =============================================================================
// window.onesat - 1Sat API (standard prompts via WalletPermissionsManager)
// =============================================================================

// Create the 1sat API using CWI directly
const onesatApi = new OneSatApi(CWI);

// =============================================================================
// window.yours - Extension-specific interface (legacy compatibility)
// Most methods delegate to OneSatApi which uses CWI internally
// =============================================================================

//@ts-ignore TODO: remove this once MNEE is released.
const yoursProvider: YoursProviderType = {
  isReady: true,
  on,
  removeListener,
  // Connection (yours-specific, handled by background.ts)
  connect: createYoursMethod<string | undefined, void>(YoursEventName.CONNECT),
  disconnect: createYoursMethod<boolean, void>(YoursEventName.DISCONNECT),
  isConnected: createYoursMethod<boolean, void>(YoursEventName.IS_CONNECTED),
  // Legacy identity methods (yours-specific, handled by background.ts)
  getPubKeys: createYoursMethod<PubKeys | undefined, void>(YoursEventName.GET_PUB_KEYS),
  getAddresses: createYoursMethod<Addresses | undefined, void>(YoursEventName.GET_LEGACY_ADDRESSES),
  getSocialProfile: createYoursMethod<YoursSocialProfile | undefined, void>(YoursEventName.GET_SOCIAL_PROFILE),
  // Delegate to OneSatApi (uses CWI internally)
  getNetwork: async () => (await CWI.getNetwork({})).network as NetWork,
  getBalance: () => onesatApi.getBalance(),
  getPaymentUtxos: () => onesatApi.getPaymentUtxos(),
  getExchangeRate: () => onesatApi.getExchangeRate(),
  getBsv20s: () => onesatApi.getBsv21Balances(),
  // Transactions - delegate to OneSatApi
  sendBsv: (requests: SendBsv[]) => onesatApi.sendBsv(requests),
  transferOrdinal: (request: TransferOrdinal) => onesatApi.transferOrdinal(request),
  purchaseOrdinal: (request: PurchaseOrdinal) => onesatApi.purchaseOrdinal(request),
  purchaseBsv20: (request: PurchaseOrdinal) => onesatApi.purchaseBsv21(request.outpoint),
  inscribe: (requests: InscribeRequest[]) => onesatApi.inscribe(requests[0]), // OneSatApi takes single request
  lockBsv: (requests: LockRequest[]) => onesatApi.lockBsv(requests),
  // Signing - delegate to OneSatApi
  signMessage: (request: SignMessage) => onesatApi.signMessage(request),
  getSignatures: (request: GetSignatures) => onesatApi.getSignatures(request),
  broadcast: (request: Broadcast) => onesatApi.broadcast(request),
  // Encryption - delegate to CWI
  encrypt: async (request: EncryptRequest) => {
    const result = await CWI.encrypt(request);
    return result.ciphertext;
  },
  decrypt: async (request: DecryptRequest) => {
    const result = await CWI.decrypt(request);
    return result.plaintext;
  },
  // TODO: These need yours-specific handlers or MNEE integration
  getMNEEBalance: createYoursMethod<MNEEBalance | undefined, void>(YoursEventName.GET_MNEE_BALANCE),
  sendBsv20: createYoursMethod<SendBsv20Response | undefined, SendBsv20>(YoursEventName.SEND_BSV20),
  sendMNEE: createYoursMethod<SendMNEEResponse | undefined, SendMNEE[]>(YoursEventName.SEND_MNEE),
  // Key derivation - TODO: implement via CWI or yours-specific
  generateTaggedKeys: createYoursMethod<TaggedDerivationResponse, TaggedDerivationRequest>(
    YoursEventName.GENERATE_TAGGED_KEYS,
  ),
  getTaggedKeys: createYoursMethod<TaggedDerivationResponse[] | undefined, GetTaggedKeysRequest>(
    YoursEventName.GET_TAGGED_KEYS,
  ),
};

// =============================================================================
// Inject on window
// =============================================================================

if (typeof window !== 'undefined') {
  // Yours wallet provider (legacy compatibility)
  (window.yours as typeof yoursProvider) = yoursProvider;

  // 1sat ecosystem API (wallet operations with standard WalletPermissionsManager prompts)
  (window as unknown as { onesat: typeof onesatApi }).onesat = onesatApi;

  // BRC-100 WalletInterface
  // window.CWI is already injected by ./cwi
}

// Utility function to filter and emit only whitelisted events
const emitWhitelistedEvent = (action: YoursEventName, params: RequestParams) => {
  if (whitelistedEvents.includes(action)) {
    emit(action as YoursEvents, params);
  }
};

self.addEventListener(CustomListenerName.YOURS_EMIT_EVENT, (event: Event) => {
  const emitEvent = event as unknown as EmitEvent;
  const { action, params } = emitEvent.detail;

  emitWhitelistedEvent(action, params);
});
