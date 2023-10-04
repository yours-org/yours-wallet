/* global chrome */

console.log("Panda Wallet Background Script Running!");

let responseCallbackForConnectRequest;
let responseCallbackForSendBsvrequest;
let responseCallbackForTransferOrdinalRequest;
let popupWindowId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);

  switch (message.action) {
    case "connect":
      return processConnectRequest(sendResponse);
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
  responseCallbackForConnectRequest = sendResponse; // Store the callback for later
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

  return true; // Indicates that we'll respond asynchronously
};

const processUserDecision = (message) => {
  if (responseCallbackForConnectRequest) {
    if (message.decision === "confirmed") {
      responseCallbackForConnectRequest({
        type: "connect",
        success: true,
        data: "User confirmed connection",
      });
    } else {
      responseCallbackForConnectRequest({
        type: "connect",
        success: false,
        error: "User canceled connection",
      });
    }
    responseCallbackForConnectRequest = null; // Reset callback
    popupWindowId = null; // Reset the stored window ID
  }
  return true; // To indicate we've handled the decision
};

const processGetBsvAddress = (sendResponse) => {
  chrome.storage.local.get(["appState"], (result) => {
    if (!result?.appState?.isLocked && result.appState.bsvAddress) {
      sendResponse({
        type: "getBsvAddress",
        success: true,
        data: result.appState.bsvAddress,
      });
    } else {
      sendResponse({
        type: "getBsvAddress",
        success: false,
        error: "You must connect first. Wallet locked!",
      });
    }
  });
  return true;
};

const processGetOrdAddress = (sendResponse) => {
  chrome.storage.local.get(["appState"], (result) => {
    if (!result?.appState?.isLocked && result.appState.ordAddress) {
      sendResponse({
        type: "getOrdAddress",
        success: true,
        data: result.appState.ordAddress,
      });
    } else {
      sendResponse({
        type: "getOrdAddress",
        success: false,
        error: "You must connect first. Wallet locked!",
      });
    }
  });
  return true;
};

const processGetOrdinals = (sendResponse) => {
  chrome.storage.local.get(["appState"], (result) => {
    if (!result?.appState?.isLocked && result.appState.ordinals) {
      sendResponse({
        type: "getOrdinals",
        success: true,
        data: result.appState.ordinals,
      });
    } else {
      sendResponse({
        type: "getOrdinals",
        success: false,
        error: "You must connect first. Wallet locked!",
      });
    }
  });
  return true;
};

const processSendBsv = (sendResponse, message) => {
  responseCallbackForSendBsvrequest = sendResponse;
  if (message.params) {
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
  } else {
    sendResponse({
      type: "sendBsv",
      success: false,
      error: "You must connect first. Wallet locked!",
    });
  }
  return true;
};

const processTransferOrdinal = (sendResponse, message) => {
  responseCallbackForTransferOrdinalRequest = sendResponse;
  if (message.params) {
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
  } else {
    sendResponse({
      type: "transferOrdinal",
      success: false,
      error: "You must connect first. Wallet locked!",
    });
  }
  return true;
};

const processSendBsvResult = (message) => {
  if (responseCallbackForSendBsvrequest) {
    if (message.txid) {
      responseCallbackForSendBsvrequest({
        type: "sendBsv",
        success: true,
        data: message.txid,
      });
    } else {
      responseCallbackForSendBsvrequest({
        type: "sendBsv",
        success: false,
        error: "Could not get a valid txid",
      });
    }
    responseCallbackForSendBsvrequest = null; // Reset callback
    popupWindowId = null; // Reset the stored window ID
    chrome.storage.local.remove("sendBsv");
  }

  return true;
};

const processTransferOrdinalResult = (message) => {
  if (responseCallbackForTransferOrdinalRequest) {
    if (message.txid) {
      responseCallbackForTransferOrdinalRequest({
        type: "transferOrdinal",
        success: true,
        data: message.txid,
      });
    } else {
      responseCallbackForTransferOrdinalRequest({
        type: "transferOrdinal",
        success: false,
        error: "Could not get a valid txid",
      });
    }
    responseCallbackForTransferOrdinalRequest = null; // Reset callback
    popupWindowId = null; // Reset the stored window ID
    chrome.storage.local.remove("transferOrdinal");
  }

  return true;
};

chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === popupWindowId) {
    // The popup was closed by the user. Send a "canceled" response.
    if (responseCallbackForConnectRequest) {
      responseCallbackForConnectRequest({
        type: "connect",
        success: false,
        error: "User closed the popup",
      });
      responseCallbackForConnectRequest = null; // Reset callback
    }

    if (responseCallbackForSendBsvrequest) {
      responseCallbackForSendBsvrequest({
        type: "sendBsv",
        success: false,
        error: "Could not get a valid txid",
      });
      responseCallbackForSendBsvrequest = null; // Reset callback
      chrome.storage.local.remove("sendBsv");
    }

    if (responseCallbackForTransferOrdinalRequest) {
      responseCallbackForTransferOrdinalRequest({
        type: "transferOrdinal",
        success: false,
        error: "Could not get a valid txid",
      });
      responseCallbackForTransferOrdinalRequest = null; // Reset callback
      chrome.storage.local.remove("transferOrdinal");
    }
    popupWindowId = null; // Reset the stored ID
  }
});
