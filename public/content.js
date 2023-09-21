/* global chrome */

console.log("I am a content script!");

const script = document.createElement("script");
script.src = chrome.runtime.getURL("inject.js");
(document.head || document.documentElement).appendChild(script);

document.addEventListener("PandaRequest", (e) => {
  if (e.detail.type === "connect") {
    chrome.runtime.sendMessage({ action: "connect" }, responseCallback);
  } else if (e.detail.type === "getAddress") {
    chrome.runtime.sendMessage({ action: "getAddress" }, responseCallback);
  }
});

const responseCallback = (response) => {
  console.log(response); //TODO: Remove this
  const responseEvent = new CustomEvent("PandaResponse", { detail: response });
  document.dispatchEvent(responseEvent);
};
