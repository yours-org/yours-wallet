/* global chrome */

console.log("Panda Wallet Background Script Running!");

let responseCallbackForConnectRequest;
let responseCallbackForSendBsvRequest;
let responseCallbackForTransferOrdinalRequest;
let popupWindowId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "connect":
      return processConnectRequest(sendResponse);
    case "isConnected":
      return processIsConnectedRequest(sendResponse);
    case "userDecision":
      return processUserDecision(message);
    case "getBsvAddress":
      return processGetBsvAddress(sendResponse);
    case "getOrdAddress":
      return processGetOrdAddress(sendResponse);
    case "getOrdinals":
      return processGetOrdinals(sendResponse);
    case "sendBsv":
      return processSendBsv(sendResponse, message);
    case "transferOrdinal":
      return processTransferOrdinal(sendResponse, message);
    case "sendBsvResult":
      return processSendBsvResult(message);
    case "transferOrdinalResult":
      return processTransferOrdinalResult(message);
    default:
      break;
  }
});

const processConnectRequest = (sendResponse) => {
  responseCallbackForConnectRequest = sendResponse;
  chrome.windows.create(
    {
      url: chrome.runtime.getURL("index.html"),
      type: "popup",
      width: 360,
      height: 567,
    },
    (window) => {
      popupWindowId = window.id;
    }
  );

  return true;
};

const processIsConnectedRequest = (sendResponse) => {
  try {
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes
    chrome.storage.local.get(["appState", "lastActiveTime"], (result) => {
      const currentTime = Date.now();
      const lastActiveTime = result.lastActiveTime;

      sendResponse({
        type: "isConnected",
        success: true,
        data:
          !result?.appState?.isLocked &&
          currentTime - lastActiveTime < INACTIVITY_LIMIT,
      });
    });
  } catch (error) {
    sendResponse({
      type: "isConnected",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processUserDecision = (message) => {
  try {
    if (responseCallbackForConnectRequest) {
      responseCallbackForConnectRequest({
        type: "connect",
        success: true,
        data:
          message.decision === "confirmed"
            ? "User confirmed connection!"
            : "User canceled connection",
      });

      responseCallbackForConnectRequest = null;
      popupWindowId = null;
    }
  } catch (error) {
    responseCallbackForConnectRequest({
      type: "connect",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processGetBsvAddress = (sendResponse) => {
  try {
    chrome.storage.local.get(["appState"], (result) => {
      sendResponse({
        type: "getBsvAddress",
        success: true,
        data: result?.appState?.bsvAddress,
      });
    });
  } catch (error) {
    sendResponse({
      type: "getBsvAddress",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processGetOrdAddress = (sendResponse) => {
  try {
    chrome.storage.local.get(["appState"], (result) => {
      sendResponse({
        type: "getOrdAddress",
        success: true,
        data: result?.appState?.ordAddress,
      });
    });
  } catch (error) {
    sendResponse({
      type: "getOrdAddress",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processGetOrdinals = (sendResponse) => {
  try {
    chrome.storage.local.get(["appState"], (result) => {
      sendResponse({
        type: "getOrdinals",
        success: true,
        data: result?.appState?.ordinals ?? [],
      });
    });
  } catch (error) {
    sendResponse({
      type: "getOrdinals",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processSendBsv = (sendResponse, message) => {
  if (!message.params) throw Error("Must provide valid params!");
  try {
    responseCallbackForSendBsvRequest = sendResponse;
    chrome.storage.local
      .set({
        sendBsv: message.params,
      })
      .then(() => {
        chrome.windows.create(
          {
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: 360,
            height: 567,
          },
          (window) => {
            popupWindowId = window.id;
          }
        );
      });
  } catch (error) {
    sendResponse({
      type: "sendBsv",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processTransferOrdinal = (sendResponse, message) => {
  if (!message.params) throw Error("Must provide valid params!");
  try {
    responseCallbackForTransferOrdinalRequest = sendResponse;
    chrome.storage.local
      .set({
        transferOrdinal: message.params,
      })
      .then(() => {
        chrome.windows.create(
          {
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: 360,
            height: 567,
          },
          (window) => {
            popupWindowId = window.id;
          }
        );
      });
  } catch (error) {
    sendResponse({
      type: "transferOrdinal",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processSendBsvResult = (message) => {
  if (!responseCallbackForSendBsvRequest) throw Error("Missing callback!");
  try {
    responseCallbackForSendBsvRequest({
      type: "sendBsv",
      success: true,
      data: message?.txid,
    });

    responseCallbackForSendBsvRequest = null;
    popupWindowId = null;
    chrome.storage.local.remove("sendBsv");
  } catch (error) {
    responseCallbackForSendBsvRequest({
      type: "sendBsv",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processTransferOrdinalResult = (message) => {
  if (!responseCallbackForTransferOrdinalRequest)
    throw Error("Missing callback!");
  try {
    responseCallbackForTransferOrdinalRequest({
      type: "transferOrdinal",
      success: true,
      data: message?.txid,
    });

    responseCallbackForTransferOrdinalRequest = null;
    popupWindowId = null;
    chrome.storage.local.remove("transferOrdinal");
  } catch (error) {
    responseCallbackForTransferOrdinalRequest({
      type: "transferOrdinal",
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === popupWindowId) {
    if (responseCallbackForConnectRequest) {
      responseCallbackForConnectRequest({
        type: "connect",
        success: true,
        data: "User dismissed the request!",
      });
      responseCallbackForConnectRequest = null;
    }

    if (responseCallbackForSendBsvRequest) {
      responseCallbackForSendBsvRequest({
        type: "sendBsv",
        success: true,
        data: "User dismissed the request!",
      });
      responseCallbackForSendBsvRequest = null;
      chrome.storage.local.remove("sendBsv");
    }

    if (responseCallbackForTransferOrdinalRequest) {
      responseCallbackForTransferOrdinalRequest({
        type: "transferOrdinal",
        success: true,
        data: "User dismissed the request!",
      });
      responseCallbackForTransferOrdinalRequest = null;
      chrome.storage.local.remove("transferOrdinal");
    }
    popupWindowId = null;
  }
});
