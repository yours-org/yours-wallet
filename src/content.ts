/* global chrome */

import { isCWIEventName } from '@1sat/wallet-browser';
import { CustomListenerName, RequestEventDetail, RequestParams, ResponseEventDetail } from './inject';

console.log('🌱 Yours Wallet Loaded');

// inject.js runs as a MAIN-world content script (see manifest.json), so
// window.CWI is bound before any page script executes.

// Forward CWI requests from page to background service worker
self.addEventListener(CustomListenerName.YOURS_REQUEST, (e: Event) => {
  const { type, messageId, params: originalParams = {} } = (e as CustomEvent<RequestEventDetail>).detail;
  if (!type || !isCWIEventName(type)) return;

  let params: RequestParams = {};

  if (Array.isArray(originalParams)) {
    params.data = originalParams;
  } else if (typeof originalParams === 'object') {
    params = { ...params, ...originalParams };
  }

  // Use originator at message level (BRC-100 standard)
  const originator = window.location.host;

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
