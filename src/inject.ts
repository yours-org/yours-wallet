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
  Ordinal,
  PubKeys,
  PurchaseOrdinal,
  SendBsv,
  SendBsvResponse,
  SignatureResponse,
  SignedMessage,
  SignMessage,
  SocialProfile,
  TaggedDerivationRequest,
  TaggedDerivationResponse,
  TransferOrdinal,
  Utxo,
  YoursEventListeners,
  YoursEvents,
  YoursProviderType,
} from 'yours-wallet-provider';

export enum YoursEventName {
  CONNECT = 'connectRequest',
  DISCONNECT = 'disconnect',
  IS_CONNECTED = 'isConnected',
  GET_PUB_KEYS = 'getPubKeys',
  GET_ADDRESSES = 'getAddresses',
  GET_NETWORK = 'getNetwork',
  GET_BALANCE = 'getBalance',
  GET_ORDINALS = 'getOrdinals',
  SEND_BSV = 'sendBsvRequest',
  TRANSFER_ORDINAL = 'transferOrdinalRequest',
  SIGN_MESSAGE = 'signMessageRequest',
  BROADCAST = 'broadcastRequest',
  GET_SIGNATURES = 'getSignaturesRequest',
  GET_SOCIAL_PROFILE = 'getSocialProfile',
  GET_PAYMENT_UTXOS = 'getPaymentUtxos',
  GET_EXCHANGE_RATE = 'getExchangeRate',
  PURCHASE_ORDINAL = 'purchaseOrdinalRequest',
  GENERATE_TAGGED_KEYS = 'generateTaggedKeysRequest',
  GET_TAGGED_KEYS = 'getTaggedKeys',
  INSCRIBE = 'sendBsvRequest',
  ENCRYPT = 'encryptRequest',
  DECRYPT = 'decryptRequest',
  SIGNED_OUT = 'signedOut',
  USER_CONNECT_RESPONSE = 'userConnectResponse',
  SEND_BSV_RESPONSE = 'sendBsvResponse',
  TRANSFER_ORDINAL_RESPONSE = 'transferOrdinalResponse',
  PURCHASE_ORDINAL_RESPONSE = 'purchaseOrdinalResponse',
  SIGN_MESSAGE_RESPONSE = 'signMessageResponse',
  BROADCAST_RESPONSE = 'broadcastResponse',
  GET_SIGNATURES_RESPONSE = 'getSignaturesResponse',
  GENERATE_TAGGED_KEYS_RESPONSE = 'generateTaggedKeysResponse',
  ENCRYPT_RESPONSE = 'encryptResponse',
  DECRYPT_RESPONSE = 'decryptResponse',
  SYNC_UTXOS = 'syncUtxos', // This is not exposed on the provider
  QUEUE_STATUS_UPDATE = 'queueStatusUpdate', // This is not exposed on the provider
  IMPORT_STATUS_UPDATE = 'importStatusUpdate', // This is not exposed on the provider
  FETCHING_TX_STATUS_UPDATE = 'fetchingTx', // This is not exposed on the provider
  BLOCK_HEIGHT_UPDATE = 'blockHeightUpdate', // This is not exposed on the provider
  SWITCH_ACCOUNT = 'switchAccount', // This is not exposed on the provider
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
    | InscribeRequest[]
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

export type ResponseEventDetail = {
  type: YoursEventName;
  success: boolean;
  data?: (
    | ConnectResponse
    | SendBsvResponse
    | PubKeys
    | Addresses
    | NetWork
    | Balance
    | Ordinal[]
    | SignatureResponse[]
    | SocialProfile
    | TaggedDerivationResponse
    | TaggedDerivationResponse[]
    | SignedMessage
    | Utxo[]
    | boolean
    | string
    | number
    | string[]
    | undefined
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

const whitelistedEvents: string[] = [YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT]; // Whitelisted event names

const createYoursEventEmitter = () => {
  const eventListeners = new Map<string, YoursEventListeners[]>(); // Object to store event listeners

  const on = (eventName: YoursEvents, callback: YoursEventListeners) => {
    // Check if the provided event name is in the whitelist
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

  return {
    on,
    removeListener,
    emit,
  };
};

const { on, removeListener, emit } = createYoursEventEmitter();

const provider: YoursProviderType = {
  isReady: true,
  on,
  removeListener,
  connect: createYoursMethod<string | undefined, void>(YoursEventName.CONNECT),
  disconnect: createYoursMethod<boolean, void>(YoursEventName.DISCONNECT),
  isConnected: createYoursMethod<boolean, void>(YoursEventName.IS_CONNECTED),
  getPubKeys: createYoursMethod<PubKeys | undefined, void>(YoursEventName.GET_PUB_KEYS),
  getAddresses: createYoursMethod<Addresses | undefined, void>(YoursEventName.GET_ADDRESSES),
  getNetwork: createYoursMethod<NetWork | undefined, void>(YoursEventName.GET_NETWORK),
  getBalance: createYoursMethod<Balance | undefined, void>(YoursEventName.GET_BALANCE),
  getOrdinals: createYoursMethod<Ordinal[] | undefined, void>(YoursEventName.GET_ORDINALS),
  sendBsv: createYoursMethod<SendBsvResponse | undefined, SendBsv[]>(YoursEventName.SEND_BSV),
  transferOrdinal: createYoursMethod<string | undefined, TransferOrdinal>(YoursEventName.TRANSFER_ORDINAL),
  signMessage: createYoursMethod<SignedMessage | undefined, SignMessage>(YoursEventName.SIGN_MESSAGE),
  broadcast: createYoursMethod<string | undefined, Broadcast>(YoursEventName.BROADCAST),
  getSignatures: createYoursMethod<SignatureResponse[] | undefined, GetSignatures>(YoursEventName.GET_SIGNATURES),
  getSocialProfile: createYoursMethod<SocialProfile | undefined, void>(YoursEventName.GET_SOCIAL_PROFILE),
  getPaymentUtxos: createYoursMethod<Utxo[] | undefined, void>(YoursEventName.GET_PAYMENT_UTXOS),
  getExchangeRate: createYoursMethod<number | undefined, void>(YoursEventName.GET_EXCHANGE_RATE),
  purchaseOrdinal: createYoursMethod<string | undefined, PurchaseOrdinal>(YoursEventName.PURCHASE_ORDINAL),
  generateTaggedKeys: createYoursMethod<TaggedDerivationResponse, TaggedDerivationRequest>(
    YoursEventName.GENERATE_TAGGED_KEYS,
  ),
  getTaggedKeys: createYoursMethod<TaggedDerivationResponse[] | undefined, GetTaggedKeysRequest>(
    YoursEventName.GET_TAGGED_KEYS,
  ),
  inscribe: createYoursMethod<SendBsvResponse | undefined, InscribeRequest[]>(YoursEventName.INSCRIBE),
  encrypt: createYoursMethod<string[] | undefined, EncryptRequest>(YoursEventName.ENCRYPT),
  decrypt: createYoursMethod<string[] | undefined, DecryptRequest>(YoursEventName.DECRYPT),
};

if (typeof window !== 'undefined') {
  window.panda = provider;
  window.yours = provider;
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
