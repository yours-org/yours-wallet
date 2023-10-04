/* global chrome */

console.log("Panda Wallet Loaded");

const script = document.createElement("script");
script.src = chrome.runtime.getURL("inject.js");
(document.head || document.documentElement).appendChild(script);

document.addEventListener("PandaRequest", (e) => {
  if (!e?.detail?.type) return;
  const { type, params } = e.detail;
  // one of type: connect, getBsvAddress, getOrdAddress
  chrome.runtime.sendMessage({ action: type, params }, responseCallback);
});

const responseCallback = (response) => {
  const responseEvent = new CustomEvent("PandaResponse", { detail: response });
  document.dispatchEvent(responseEvent);
};
