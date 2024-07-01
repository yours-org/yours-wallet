/* global chrome */

import {
  CustomListenerName,
  EmitEventDetail,
  RequestEventDetail,
  RequestParams,
  ResponseEventDetail,
  YoursEventName,
} from './inject';

console.log('🌱 Yours Wallet Loaded');

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

self.addEventListener(CustomListenerName.YOURS_REQUEST, (e: Event) => {
  const { type, messageId, params: originalParams = {} } = (e as CustomEvent<RequestEventDetail>).detail;
  if (!type) return;

  let params: RequestParams = {};

  if (type === YoursEventName.CONNECT) {
    params.appName =
      document.title ||
      (document.querySelector('meta[name="application-name"]') as HTMLMetaElement)?.content ||
      'Unknown';

    params.appIcon =
      (document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement)?.href ||
      (document.querySelector('link[rel="icon"]') as HTMLLinkElement)?.href ||
      '';
  }

  if (Array.isArray(originalParams)) {
    params.data = originalParams;
  } else if (typeof originalParams === 'object') {
    params = { ...params, ...originalParams };
  }

  params.domain = window.location.hostname;

  chrome.runtime.sendMessage({ action: type, params }, buildResponseCallback(messageId));
});

const buildResponseCallback = (messageId: string) => {
  return (response: ResponseEventDetail) => {
    const responseEvent = new CustomEvent(messageId, { detail: response });
    self.dispatchEvent(responseEvent);
  };
};

chrome.runtime.onMessage.addListener((message: EmitEventDetail) => {
  const { type, action, params } = message;
  if (type === CustomListenerName.YOURS_EMIT_EVENT) {
    const event = new CustomEvent(type, { detail: { action, params } });
    self.dispatchEvent(event);
  }
});
