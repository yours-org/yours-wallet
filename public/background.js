/* global chrome */

console.log("Panda background script running!");

let responseCallbackForConnectRequest; // Store the callback to respond later
let popupWindowId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);

  if (message.action === "connect") {
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
  } else if (message.action === "userDecision") {
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
  } else if (message.action === "getAddress") {
    const dummyAddress = "0x1234abcd5678efgh9012ijklmnop3456";
    sendResponse({
      type: "getAddress",
      success: true,
      data: dummyAddress,
    });
    return true; // Indicates that we've handled the request
  }
});

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
    popupWindowId = null; // Reset the stored ID
  }
});
