const createYoursMethod = (type) => {
  return async (params) => {
    return new Promise((resolve, reject) => {
      // Send request
      const messageId = `${type}-${Date.now()}-${Math.random()}`;
      const requestEvent = new CustomEvent('YoursRequest', {
        detail: { messageId, type, params },
      });
      document.dispatchEvent(requestEvent);

      // Listen for a response
      function onResponse(e) {
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

  const on = (eventName, callback) => {
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

  const removeListener = (eventName, callback) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      eventListeners.set(
        eventName,
        listeners.filter((fn) => fn !== callback),
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
  connect: createYoursMethod('connect'),
  disconnect: createYoursMethod('disconnect'),
  isConnected: createYoursMethod('isConnected'),
  getPubKeys: createYoursMethod('getPubKeys'),
  getAddresses: createYoursMethod('getAddresses'),
  getNetwork: createYoursMethod('getNetwork'),
  getBalance: createYoursMethod('getBalance'),
  getOrdinals: createYoursMethod('getOrdinals'),
  sendBsv: createYoursMethod('sendBsv'),
  transferOrdinal: createYoursMethod('transferOrdinal'),
  signMessage: createYoursMethod('signMessage'),
  broadcast: createYoursMethod('broadcast'),
  getSignatures: createYoursMethod('getSignatures'),
  getSocialProfile: createYoursMethod('getSocialProfile'),
  getPaymentUtxos: createYoursMethod('getPaymentUtxos'),
  getExchangeRate: createYoursMethod('getExchangeRate'),
  purchaseOrdinal: createYoursMethod('purchaseOrdinal'),
  generateTaggedKeys: createYoursMethod('generateTaggedKeys'),
  getTaggedKeys: createYoursMethod('getTaggedKeys'),
  inscribe: createYoursMethod('sendBsv'),
  encrypt: createYoursMethod('encrypt'),
  decrypt: createYoursMethod('decrypt'),
};

window.panda = provider;
window.yours = provider;

document.addEventListener('YoursEmitEvent', (event) => {
  const { action, params } = event.detail;
  // Check if window.panda is defined and has event listeners for the action
  if (window.panda && window.panda.eventListeners && window.panda.eventListeners.has(action)) {
    const listeners = window.panda.eventListeners.get(action);
    // Trigger each listener with the provided params
    listeners.forEach((callback) => callback(params));
  }
});

document.addEventListener('YoursEmitEvent', (event) => {
  const { action, params } = event.detail;
  // Check if window.yours is defined and has event listeners for the action
  if (window.yours && window.yours.eventListeners && window.yours.eventListeners.has(action)) {
    const listeners = window.yours.eventListeners.get(action);
    // Trigger each listener with the provided params
    listeners.forEach((callback) => callback(params));
  }
});
