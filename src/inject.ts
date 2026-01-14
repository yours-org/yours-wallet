// Import CWI to inject window.CWI (BRC-100 WalletInterface)
import './cwi';

// Event types for yours-wallet specific events
export enum YoursEventName {
  // Events broadcast to dApps
  SIGNED_OUT = 'signedOut',
  SWITCH_ACCOUNT = 'switchAccount',

  // Internal events (not exposed to dApps)
  SYNC_STATUS_UPDATE = 'syncStatusUpdate',
  BLOCK_HEIGHT_UPDATE = 'blockHeightUpdate',

  // Connection/auth flow (used by CWI.waitForAuthentication callback)
  USER_CONNECT_RESPONSE = 'userConnectResponse',

  // Internal UI requests (popup -> background)
  GET_PUB_KEYS = 'getPubKeys',
  GET_LEGACY_ADDRESSES = 'getLegacyAddresses',
  GET_RECEIVE_ADDRESS = 'getReceiveAddress',
  GET_SOCIAL_PROFILE = 'getSocialProfile',
}

export enum CustomListenerName {
  YOURS_EMIT_EVENT = 'YoursEmitEvent',
  YOURS_REQUEST = 'YoursRequest',
  YOURS_RESPONSE = 'YoursResponse',
}

export type RequestParams = {
  appName?: string;
  appIcon?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
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
  type: YoursEventName | string;
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
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

// Event emitter for yours-specific events (SIGNED_OUT, SWITCH_ACCOUNT)
// These are the only events broadcast to dApps
const whitelistedEvents: string[] = [YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT];

type EventCallback = (params: RequestParams) => void;

const createYoursEventEmitter = () => {
  const eventListeners = new Map<string, EventCallback[]>();

  const on = (eventName: string, callback: EventCallback) => {
    if (whitelistedEvents.includes(eventName)) {
      if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, []);
      }
      eventListeners.get(eventName)?.push(callback);
    } else {
      console.error('Event name is not whitelisted:', eventName);
    }
  };

  const removeListener = (eventName: string, callback: EventCallback) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      eventListeners.set(
        eventName,
        listeners.filter((fn) => fn !== callback),
      );
    }
  };

  const emit = (eventName: string, params: RequestParams) => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((callback) => callback(params));
    }
  };

  return { on, removeListener, emit };
};

const { emit } = createYoursEventEmitter();

// Utility function to filter and emit only whitelisted events
const emitWhitelistedEvent = (action: YoursEventName, params: RequestParams) => {
  if (whitelistedEvents.includes(action)) {
    emit(action, params);
  }
};

// Listen for broadcast events from background (SIGNED_OUT, SWITCH_ACCOUNT)
self.addEventListener(CustomListenerName.YOURS_EMIT_EVENT, (event: Event) => {
  const emitEvent = event as unknown as EmitEvent;
  const { action, params } = emitEvent.detail;

  emitWhitelistedEvent(action, params);
});
