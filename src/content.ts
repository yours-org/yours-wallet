/* global chrome */

console.log('🌱 Yours Wallet Loaded');

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

document.addEventListener('YoursRequest', (e) => {
  //@ts-ignore
  if (!e?.detail?.type) return;
  //@ts-ignore
  const { type, params: originalParams = {} } = e.detail;

  let params = {};

  if (type === 'connect') {
    //@ts-ignore
    params.appName = document.title || document.querySelector('meta[name="application-name"]')?.content || 'Unknown';
    //@ts-ignore
    params.appIcon =
      //@ts-ignore
      document.querySelector('link[rel="apple-touch-icon"]')?.href ||
      //@ts-ignore
      document.querySelector('link[rel="icon"]')?.href ||
      '';
  }

  if (Array.isArray(originalParams)) {
    //@ts-ignore
    params.data = originalParams;
  } else if (typeof originalParams === 'object') {
    params = { ...params, ...originalParams };
  }

  //@ts-ignore
  params.domain = window.location.hostname;

  //@ts-ignore
  chrome.runtime.sendMessage({ action: type, params }, buildResponseCallback(e.detail.messageId));
});

//@ts-ignore
const buildResponseCallback = (messageId) => {
  //@ts-ignore
  return (response) => {
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
