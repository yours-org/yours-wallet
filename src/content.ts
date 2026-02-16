/* global chrome */

import { CustomListenerName, EmitEventDetail, RequestEventDetail, RequestParams, ResponseEventDetail } from './inject';

console.log('🌱 Yours Wallet Loaded');

// Inject the inject.js script into the page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

// Forward CWI requests from page to background service worker
self.addEventListener(CustomListenerName.YOURS_REQUEST, (e: Event) => {
  const { type, messageId, params: originalParams = {} } = (e as CustomEvent<RequestEventDetail>).detail;
  if (!type) return;

  let params: RequestParams = {};

  if (Array.isArray(originalParams)) {
    params.data = originalParams;
  } else if (typeof originalParams === 'object') {
    params = { ...params, ...originalParams };
  }

  // Use originator at message level (BRC-100 standard)
  const originator = window.location.hostname;

  chrome.runtime.sendMessage({ action: type, params, originator }, buildResponseCallback(messageId));
});

const buildResponseCallback = (messageId: string) => {
  return (response: ResponseEventDetail) => {
    const detail = chrome.runtime.lastError
      ? { success: false, error: chrome.runtime.lastError.message || 'Message channel closed' }
      : (response ?? { success: false, error: 'No response from service worker' });
    const responseEvent = new CustomEvent(messageId, { detail });
    self.dispatchEvent(responseEvent);
  };
};

// Forward broadcast events from background to page (SIGNED_OUT, SWITCH_ACCOUNT)
chrome.runtime.onMessage.addListener((message: EmitEventDetail) => {
  const { type, action, params } = message;
  if (type === CustomListenerName.YOURS_EMIT_EVENT) {
    const event = new CustomEvent(type, { detail: { action, params } });
    self.dispatchEvent(event);
  }
});
