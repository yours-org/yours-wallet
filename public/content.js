/* global chrome */

console.log('🐼 Panda Wallet Loaded');

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

document.addEventListener('PandaRequest', (e) => {
  if (!e?.detail?.type) return;
  const { type, params: originalParams = {} } = e.detail;

  let params = {};

  if (type === 'connect') {
    params.appName = document.title || document.querySelector('meta[name="application-name"]')?.content || 'Unknown';
    params.appIcon =
      document.querySelector('link[rel="apple-touch-icon"]')?.href ||
      document.querySelector('link[rel="icon"]')?.href ||
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

const buildResponseCallback = (messageId) => {
  return (response) => {
    const responseEvent = new CustomEvent(messageId, { detail: response });
    document.dispatchEvent(responseEvent);
  };
};
