export enum YoursEventName {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  IS_CONNECTED = 'isConnected',
  GET_PUB_KEYS = 'getPubKeys',
  GET_ADDRESSES = 'getAddresses',
  GET_NETWORK = 'getNetwork',
  GET_BALANCE = 'getBalance',
  GET_ORDINALS = 'getOrdinals',
  SEND_BSV = 'sendBsv',
  TRANSFER_ORDINAL = 'transferOrdinal',
  SIGN_MESSAGE = 'signMessage',
  BROADCAST = 'broadcast',
  GET_SIGNATURES = 'getSignatures',
  GET_SOCIAL_PROFILE = 'getSocialProfile',
  GET_PAYMENT_UTXOS = 'getPaymentUtxos',
  GET_EXCHANGE_RATE = 'getExchangeRate',
  PURCHASE_ORDINAL = 'purchaseOrdinal',
  GENERATE_TAGGED_KEYS = 'generateTaggedKeys',
  GET_TAGGED_KEYS = 'getTaggedKeys',
  INSCRIBE = 'sendBsv',
  ENCRYPT = 'encrypt',
  DECRYPT = 'decrypt',
  SIGN_OUT = 'signOut',
  ON_NETWORK_CHANGE = 'onNetworkChange',
}

export enum CustomListenerName {
  YOURS_EMIT_EVENT = 'YoursEmitEvent',
  YOURS_REQUEST = 'YoursRequest',
  YOURS_RESPONSE = 'YoursResponse',
}

export type YoursProvider = typeof provider;

const createYoursMethod = (type: YoursEventName) => {
  return async (params: any) => {
    return new Promise((resolve, reject) => {
      // Send request
      const messageId = `${type}-${Date.now()}-${Math.random()}`;
      const requestEvent = new CustomEvent('YoursRequest', {
        detail: { messageId, type, params },
      });
      document.dispatchEvent(requestEvent);

      // Listen for a response

      function onResponse(e: any) {
        if (e.detail.type === type) {
          if (e.detail.success) {
            resolve(e.detail.data);
          } else {
            reject(e.detail.error);
          }
        }
      }

      document.addEventListener(messageId, onResponse, { once: true });
    });
  };
};

const createYoursEventEmitter = () => {
  const eventListeners = new Map(); // Object to store event listeners
  const whitelistedEvents = ['signedOut', 'networkChanged']; // Whitelisted event names

  const on = (eventName: YoursEventName, callback: any) => {
    // Check if the provided event name is in the whitelist
    if (whitelistedEvents.includes(eventName)) {
      if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, []);
      }
      eventListeners.get(eventName).push(callback);
    } else {
      console.error('Event name is not whitelisted:', eventName);
    }
  };

  const removeListener = (eventName: YoursEventName, callback: any) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      eventListeners.set(
        eventName,

        listeners.filter((fn: any) => fn !== callback),
      );
    }
  };

  return Object.freeze({
    get eventListeners() {
      return eventListeners;
    },
    get whitelistedEvents() {
      return whitelistedEvents;
    },
    on,
    removeListener,
  });
};

const provider = {
  isReady: true,
  ...createYoursEventEmitter(),
  connect: createYoursMethod(YoursEventName.CONNECT),
  disconnect: createYoursMethod(YoursEventName.DISCONNECT),
  isConnected: createYoursMethod(YoursEventName.IS_CONNECTED),
  getPubKeys: createYoursMethod(YoursEventName.GET_PUB_KEYS),
  getAddresses: createYoursMethod(YoursEventName.GET_ADDRESSES),
  getNetwork: createYoursMethod(YoursEventName.GET_NETWORK),
  getBalance: createYoursMethod(YoursEventName.GET_BALANCE),
  getOrdinals: createYoursMethod(YoursEventName.GET_ORDINALS),
  sendBsv: createYoursMethod(YoursEventName.SEND_BSV),
  transferOrdinal: createYoursMethod(YoursEventName.TRANSFER_ORDINAL),
  signMessage: createYoursMethod(YoursEventName.SIGN_MESSAGE),
  broadcast: createYoursMethod(YoursEventName.BROADCAST),
  getSignatures: createYoursMethod(YoursEventName.GET_SIGNATURES),
  getSocialProfile: createYoursMethod(YoursEventName.GET_SOCIAL_PROFILE),
  getPaymentUtxos: createYoursMethod(YoursEventName.GET_PAYMENT_UTXOS),
  getExchangeRate: createYoursMethod(YoursEventName.GET_EXCHANGE_RATE),
  purchaseOrdinal: createYoursMethod(YoursEventName.PURCHASE_ORDINAL),
  generateTaggedKeys: createYoursMethod(YoursEventName.GENERATE_TAGGED_KEYS),
  getTaggedKeys: createYoursMethod(YoursEventName.GET_TAGGED_KEYS),
  inscribe: createYoursMethod(YoursEventName.INSCRIBE),
  encrypt: createYoursMethod(YoursEventName.ENCRYPT),
  decrypt: createYoursMethod(YoursEventName.DECRYPT),
};

window.panda = provider;

window.yours = provider;

document.addEventListener(CustomListenerName.YOURS_EMIT_EVENT, (event: any) => {
  const { action, params } = event.detail;
  // Check if window.panda is defined and has event listeners for the action

  let listeners;
  if (window.panda && window.panda.eventListeners && window.panda.eventListeners.has(action)) {
    listeners = window.panda.eventListeners.get(action);
  }

  if (window.yours && window.yours.eventListeners && window.yours.eventListeners.has(action)) {
    listeners = window.yours.eventListeners.get(action);
  }

  if (!listeners) return;
  listeners.forEach((callback: any) => callback(params));
});
