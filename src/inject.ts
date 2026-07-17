// Import CWI to inject window.CWI (BRC-100 WalletInterface)
import './cwi';

// Event types for yours-wallet specific events
export enum YoursEventName {
  // Internal events (popup -> background)
  SIGNED_OUT = 'signedOut',
  SWITCH_ACCOUNT = 'switchAccount',

  // Internal events (not exposed to dApps)
  SYNC_STATUS_UPDATE = 'syncStatusUpdate',
  BLOCK_HEIGHT_UPDATE = 'blockHeightUpdate',

  // Internal UI requests (popup -> background)
  GET_BALANCE = 'getBalance',
  GET_PUB_KEYS = 'getPubKeys',
  GET_LEGACY_ADDRESSES = 'getLegacyAddresses',
  GET_RECEIVE_ADDRESS = 'getReceiveAddress',
  GET_SOCIAL_PROFILE = 'getSocialProfile',
}

export enum CustomListenerName {
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

export type WhitelistedApp = {
  domain: string;
  icon: string;
};
