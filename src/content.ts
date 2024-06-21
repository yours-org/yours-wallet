/* global chrome */

import { CustomListenerName } from './inject';

console.log('🌱 Yours Wallet Loaded');

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

document.addEventListener(CustomListenerName.YOURS_REQUEST, (e: any) => {
  if (!e?.detail?.type) return;

  const { type, params: originalParams = {} } = e.detail;

  let params: Record<string, any> = {};

  if (type === 'connect') {
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

  chrome.runtime.sendMessage({ action: type, params }, buildResponseCallback(e.detail.messageId));
});

const buildResponseCallback = (messageId: string) => {
  return (response: any) => {
    const responseEvent = new CustomEvent(messageId, { detail: response });
    document.dispatchEvent(responseEvent);
  };
};

chrome.runtime.onMessage.addListener((message) => {
  const { type, action, params } = message;
  if (type === 'YoursEmitEvent') {
    const event = new CustomEvent(type, { detail: { action, params } });
    document.dispatchEvent(event);
  }
});
