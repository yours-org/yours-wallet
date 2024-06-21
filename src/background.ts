/* global chrome */
console.log('Yours Wallet Background Script Running!');

const WOC_BASE_URL = 'https://api.whatsonchain.com/v1/bsv';

let responseCallbackForConnectRequest: any;
let responseCallbackForSendBsvRequest: any;
let responseCallbackForTransferOrdinalRequest: any;
let responseCallbackForPurchaseOrdinalRequest: any;
let responseCallbackForSignMessageRequest: any;
let responseCallbackForBroadcastRequest: any;
let responseCallbackForGetSignaturesRequest: any;
let responseCallbackForGenerateTaggedKeysRequest: any;
let responseCallbackForEncryptRequest: any;
let responseCallbackForDecryptRequest: any;
let popupWindowId: number | undefined;

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

const launchPopUp = () => {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL('index.html'),
      type: 'popup',
      width: 360,
      height: 567,
    },
    (window) => {
      popupWindowId = window?.id;
      chrome.storage.local.set({
        popupWindowId,
      });
    },
  );
};

const verifyAccess = async (requestingDomain: any) => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelist'], (result) => {
      const { whitelist } = result;
      if (!whitelist) {
        resolve(false);
        return;
      }

      if (whitelist.map((i: any) => i.domain).includes(requestingDomain)) {
        resolve(true);
      } else {
        resolve(false);
      }
      resolve(false);
    });
  });
};

const authorizeRequest = async (message: any) => {
  const { params } = message;
  return await verifyAccess(params.domain);
};

// MESSAGE LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['signedOut', 'networkChanged'].includes(message.action)) {
    return emitEventToActiveTabs(message);
  }

  const noAuthRequired = [
    'isConnected',
    'userConnectResponse',
    'sendBsvResponse',
    'transferOrdinalResponse',
    'purchaseOrdinalResponse',
    'signMessageResponse',
    'signTransactionResponse',
    'broadcastResponse',
    'getSignaturesResponse',
    'generateTaggedKeysResponse',
    'encryptResponse',
    'decryptResponse',
  ];

  if (noAuthRequired.includes(message.action)) {
    switch (message.action) {
      case 'isConnected':
        return processIsConnectedRequest(message, sendResponse);
      case 'userConnectResponse':
        return processConnectResponse(message);
      case 'sendBsvResponse':
        return processSendBsvResponse(message);
      case 'transferOrdinalResponse':
        return processTransferOrdinalResponse(message);
      case 'purchaseOrdinalResponse':
        return processPurchaseOrdinalResponse(message);
      case 'signMessageResponse':
        return processSignMessageResponse(message);
      case 'broadcastResponse':
        return processBroadcastResponse(message);
      case 'getSignaturesResponse':
        return processGetSignaturesResponse(message);
      case 'generateTaggedKeysResponse':
        return processGenerateTaggedKeysResponse(message);
      case 'encryptResponse':
        return processEncryptResponse(message);
      case 'decryptResponse':
        return processDecryptResponse(message);
      default:
        break;
    }

    return;
  }

  // We need to authorize access for these endpoints
  authorizeRequest(message).then((isAuthorized) => {
    if (message.action === 'connect') {
      return processConnectRequest(message, sendResponse, isAuthorized);
    }

    if (!isAuthorized) {
      sendResponse({
        type: message.action,
        success: false,
        error: 'Unauthorized!',
      });
      return;
    }

    switch (message.action) {
      case 'disconnect':
        return processDisconnectRequest(message, sendResponse);
      case 'getPubKeys':
        return processGetPubKeysRequest(sendResponse);
      case 'getBalance':
        return processGetBalanceRequest(sendResponse);
      case 'getAddresses':
        return processGetAddressesRequest(sendResponse);
      case 'getNetwork':
        return processGetNetworkRequest(sendResponse);
      case 'getOrdinals':
        return processGetOrdinalsRequest(sendResponse);
      case 'sendBsv':
        return processSendBsvRequest(message, sendResponse);
      case 'transferOrdinal':
        return processTransferOrdinalRequest(message, sendResponse);
      case 'purchaseOrdinal':
        return processPurchaseOrdinalRequest(message, sendResponse);
      case 'signMessage':
        return processSignMessageRequest(message, sendResponse);
      case 'broadcast':
        return processBroadcastRequest(message, sendResponse);
      case 'getSignatures':
        return processGetSignaturesRequest(message, sendResponse);
      case 'getSocialProfile':
        return processGetSocialProfileRequest(sendResponse);
      case 'getPaymentUtxos':
        return processGetPaymentUtxos(sendResponse);
      case 'getExchangeRate':
        return processGetExchangeRate(sendResponse);
      case 'generateTaggedKeys':
        return processGenerateTaggedKeysRequest(message, sendResponse);
      case 'getTaggedKeys':
        return processGetTaggedKeys(message, sendResponse);
      case 'inscribe':
        return processSendBsvRequest(message, sendResponse);
      case 'encrypt':
        return processEncryptRequest(message, sendResponse);
      case 'decrypt':
        return processDecryptRequest(message, sendResponse);
      default:
        break;
    }
  });

  return true;
});

// EMIT EVENTS ********************************

const emitEventToActiveTabs = (message: any) => {
  const { action, params } = message;
  chrome.tabs.query({ active: true }, function (tabs: any) {
    tabs.forEach(function (tab: any) {
      chrome.tabs.sendMessage(tab.id, { type: 'YoursEmitEvent', action, params });
    });
  });
  return true;
};

// REQUESTS ***************************************

const processConnectRequest = (message: any, sendResponse: any, isAuthorized: any) => {
  responseCallbackForConnectRequest = sendResponse;
  chrome.storage.local
    .set({
      connectRequest: { ...message.params, isAuthorized },
    })
    .then(() => {
      launchPopUp();
    });

  return true;
};

const processDisconnectRequest = (message: any, sendResponse: any) => {
  try {
    chrome.storage.local.get(['whitelist'], (result) => {
      if (!result.whitelist) throw Error('Already disconnected!');
      const { params } = message;

      const updatedWhitelist = result.whitelist?.filter((i: any) => i.domain !== params.domain);

      chrome.storage.local.set({ whitelist: updatedWhitelist }, () => {
        sendResponse({
          type: 'disconnect',
          success: true,
          data: true,
        });
      });
    });
  } catch (error) {
    sendResponse({
      type: 'disconnect',
      success: true, // This is true in the catch because we want to return a boolean
      data: false,
    });
  }
};

const processIsConnectedRequest = (message: any, sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState', 'lastActiveTime', 'whitelist'], (result) => {
      const currentTime = Date.now();
      const lastActiveTime = result.lastActiveTime;

      sendResponse({
        type: 'isConnected',
        success: true,
        data:
          !result?.appState?.isLocked &&
          currentTime - lastActiveTime < INACTIVITY_LIMIT &&
          result.whitelist?.map((i: any) => i.domain).includes(message.params.domain),
      });
    });
  } catch (error) {
    sendResponse({
      type: 'isConnected',
      success: true, // This is true in the catch because we want to return a boolean
      error: false,
    });
  }

  return true;
};

const processGetBalanceRequest = (sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState'], (result) => {
      sendResponse({
        type: 'getBalance',
        success: true,
        data: result?.appState?.balance,
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getBalance',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetPubKeysRequest = (sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState'], (result) => {
      sendResponse({
        type: 'getPubKeys',
        success: true,
        data: result?.appState?.pubKeys,
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getPubKeys',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetAddressesRequest = (sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState'], (result) => {
      sendResponse({
        type: 'getAddresses',
        success: true,
        data: result?.appState?.addresses,
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getAddresses',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetNetworkRequest = (sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState'], (result) => {
      sendResponse({
        type: 'getNetwork',
        success: true,
        data: result?.appState?.network ?? 'mainnet',
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getNetwork',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetOrdinalsRequest = (sendResponse: any) => {
  try {
    chrome.storage.local.get(['appState'], (result) => {
      sendResponse({
        type: 'getOrdinals',
        success: true,
        data: result?.appState?.ordinals ?? [],
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getOrdinals',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetExchangeRate = (sendResponse: any) => {
  chrome.storage.local.get(['exchangeRateCache'], async (data) => {
    try {
      const { exchangeRateCache } = data;
      if (exchangeRateCache?.rate && Date.now() - exchangeRateCache.timestamp < 5 * 60 * 1000) {
        sendResponse({
          type: 'getExchangeRate',
          success: true,
          data: Number(exchangeRateCache.rate.toFixed(2)),
        });
        sendResponse();
      } else {
        const res = await fetch(`${WOC_BASE_URL}/main/exchangerate`);
        if (!res.ok) {
          throw new Error(`Fetch error: ${res.status} - ${res.statusText}`);
        }
        const data = await res.json();
        const rate = data.rate;
        const currentTime = Date.now();
        chrome.storage.local.set({ exchangeRateCache: { rate, timestamp: currentTime } });
        sendResponse({
          type: 'getExchangeRate',
          success: true,
          data: Number(rate.toFixed(2)),
        });
      }
    } catch (error) {
      sendResponse({
        type: 'getExchangeRate',
        success: false,
        error: JSON.stringify(error),
      });
    }
  });
};

const processGetPaymentUtxos = async (sendResponse: any) => {
  try {
    chrome.storage.local.get(['paymentUtxos'], ({ paymentUtxos }) => {
      sendResponse({
        type: 'getPaymentUtxos',
        success: true,
        data:
          paymentUtxos.length > 0
            ? paymentUtxos
                .filter((u: any) => !u.spent)
                .map((utxo: any) => {
                  return {
                    satoshis: utxo.satoshis,
                    script: utxo.script,
                    txid: utxo.txid,
                    vout: utxo.vout,
                  };
                })
            : [],
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getPaymentUtxos',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processSendBsvRequest = (message: any, sendResponse: any) => {
  if (!message.params.data) {
    sendResponse({
      type: 'sendBsv',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForSendBsvRequest = sendResponse;
    let sendBsvRequest = message.params.data;

    // If in this if block, it's an inscribe() request.
    if (message.params.data[0].base64Data) {
      sendBsvRequest = message.params.data.map((d: any) => {
        return {
          address: d.address,
          inscription: {
            base64Data: d.base64Data,
            mimeType: d.mimeType,
            map: d.map,
          },
          satoshis: d.satoshis ?? 1,
        };
      });
    }

    chrome.storage.local.set({ sendBsvRequest }).then(() => {
      launchPopUp();
    });
  } catch (error) {
    sendResponse({
      type: 'sendBsv',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processTransferOrdinalRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'transferOrdinal',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForTransferOrdinalRequest = sendResponse;
    chrome.storage.local
      .set({
        transferOrdinalRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'transferOrdinal',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processPurchaseOrdinalRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'purchaseOrdinal',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForPurchaseOrdinalRequest = sendResponse;
    chrome.storage.local
      .set({
        purchaseOrdinalRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'purchaseOrdinal',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processBroadcastRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'broadcast',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForBroadcastRequest = sendResponse;
    chrome.storage.local
      .set({
        broadcastRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'broadcast',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processSignMessageRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'signMessage',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForSignMessageRequest = sendResponse;
    chrome.storage.local
      .set({
        signMessageRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'signMessage',
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processGetSignaturesRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'getSignatures',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForGetSignaturesRequest = sendResponse;
    chrome.storage.local
      .set({
        getSignaturesRequest: {
          rawtx: message.params.rawtx,
          sigRequests: message.params.sigRequests,
        },
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'getSignatures',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetSocialProfileRequest = (sendResponse: any) => {
  const HOSTED_YOURS_IMAGE = 'https://i.ibb.co/zGcthBv/yours-org-light.png';
  try {
    chrome.storage.local.get(['socialProfile'], (result) => {
      const displayName = result?.socialProfile?.displayName ? result.socialProfile.displayName : 'Anon Panda';
      const avatar = result?.socialProfile?.avatar ? result.socialProfile.avatar : HOSTED_YOURS_IMAGE;
      sendResponse({
        type: 'getSocialProfile',
        success: true,
        data: { displayName, avatar },
      });
    });
  } catch (error) {
    sendResponse({
      type: 'getSocialProfile',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGenerateTaggedKeysRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'generateTaggedKeys',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForGenerateTaggedKeysRequest = sendResponse;
    chrome.storage.local
      .set({
        generateTaggedKeysRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'generateTaggedKeys',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processGetTaggedKeys = async (message: any, sendResponse: any) => {
  if (!message.params.label) {
    sendResponse({
      type: 'getTaggedKeys',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    chrome.storage.local.get(
      ['derivationTags', 'appState', 'lastActiveTime'],
      ({ derivationTags, appState, lastActiveTime }) => {
        const currentTime = Date.now();
        if (appState?.isLocked || currentTime - lastActiveTime > INACTIVITY_LIMIT) {
          sendResponse({
            type: 'getTaggedKeys',
            success: false,
            error: 'Unauthorized! Yours Wallet is locked.',
          });
        }

        let returnData =
          derivationTags.length > 0
            ? derivationTags?.filter(
                (res: any) => res.tag.label === message.params.label && res.tag.domain === message.params.domain,
              )
            : [];

        if (returnData.length > 0 && message.params.ids?.length > 0) {
          returnData = returnData?.filter((d: any) => message.params.ids.includes(d.tag.id));
        }

        sendResponse({
          type: 'getTaggedKeys',
          success: true,
          data: returnData,
        });
      },
    );
  } catch (error) {
    sendResponse({
      type: 'getTaggedKeys',
      success: false,
      error: JSON.stringify(error),
    });
  }
};

const processEncryptRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'encrypt',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForEncryptRequest = sendResponse;
    chrome.storage.local
      .set({
        encryptRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'encrypt',
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

const processDecryptRequest = (message: any, sendResponse: any) => {
  if (!message.params) {
    sendResponse({
      type: 'decrypt',
      success: false,
      error: 'Must provide valid params!',
    });
  }
  try {
    responseCallbackForDecryptRequest = sendResponse;
    chrome.storage.local
      .set({
        decryptRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
  } catch (error) {
    sendResponse({
      type: 'decrypt',
      success: false,
      error: JSON.stringify(error),
    });
  }

  return true;
};

// RESPONSES ********************************

const processConnectResponse = (response: any) => {
  try {
    if (responseCallbackForConnectRequest) {
      responseCallbackForConnectRequest({
        type: 'connect',
        success: true,
        data: response.decision === 'approved' ? response.pubKeys.identityPubKey : undefined,
      });
    }
  } catch (error) {
    responseCallbackForConnectRequest({
      type: 'connect',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForConnectRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove('popupWindowId');
  }

  return true;
};

const processSendBsvResponse = (response: any) => {
  if (!responseCallbackForSendBsvRequest) throw Error('Missing callback!');
  try {
    responseCallbackForSendBsvRequest({
      type: 'sendBsv',
      success: true,
      data: { txid: response.txid, rawtx: response.rawtx },
    });
  } catch (error) {
    responseCallbackForSendBsvRequest({
      type: 'sendBsv',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForSendBsvRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['sendBsvRequest', 'popupWindowId']);
  }

  return true;
};

const processTransferOrdinalResponse = (response: any) => {
  if (!responseCallbackForTransferOrdinalRequest) throw Error('Missing callback!');
  try {
    responseCallbackForTransferOrdinalRequest({
      type: 'transferOrdinal',
      success: true,
      data: response?.txid,
    });
  } catch (error) {
    responseCallbackForTransferOrdinalRequest({
      type: 'transferOrdinal',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForTransferOrdinalRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['transferOrdinalRequest', 'popupWindowId']);
  }

  return true;
};

const processGenerateTaggedKeysResponse = (response: any) => {
  if (!responseCallbackForGenerateTaggedKeysRequest) throw Error('Missing callback!');
  try {
    responseCallbackForGenerateTaggedKeysRequest({
      type: 'generateTaggedKeys',
      success: true,
      data: {
        address: response?.address,
        pubKey: response?.pubKey,
        tag: response?.tag,
      },
    });
  } catch (error) {
    responseCallbackForGenerateTaggedKeysRequest({
      type: 'generateTaggedKeys',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForGenerateTaggedKeysRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['generateTaggedKeysRequest', 'popupWindowId']);
  }

  return true;
};

const processPurchaseOrdinalResponse = (response: any) => {
  if (!responseCallbackForPurchaseOrdinalRequest) throw Error('Missing callback!');
  try {
    responseCallbackForPurchaseOrdinalRequest({
      type: 'purchaseOrdinal',
      success: true,
      data: response?.txid,
    });
  } catch (error) {
    responseCallbackForPurchaseOrdinalRequest({
      type: 'purchaseOrdinal',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForPurchaseOrdinalRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['purchaseOrdinalRequest', 'popupWindowId']);
  }

  return true;
};

const processSignMessageResponse = (response: any) => {
  if (!responseCallbackForSignMessageRequest) throw Error('Missing callback!');
  try {
    responseCallbackForSignMessageRequest({
      type: 'signMessage',
      success: true,
      data: {
        address: response?.address,
        pubKey: response?.pubKey,
        message: response?.message,
        sig: response?.sig,
        derivationTag: response?.derivationTag,
      },
    });
  } catch (error) {
    responseCallbackForSignMessageRequest({
      type: 'signMessage',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForSignMessageRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['signMessageRequest', 'popupWindowId']);
  }

  return true;
};

const processBroadcastResponse = (response: any) => {
  if (!responseCallbackForBroadcastRequest) throw Error('Missing callback!');
  try {
    if (response?.error) {
      responseCallbackForBroadcastRequest({
        type: 'broadcast',
        success: false,
        error: response?.error,
      });
      return;
    }
    responseCallbackForBroadcastRequest({
      type: 'broadcast',
      success: true,
      data: response?.txid,
    });
  } catch (error) {
    responseCallbackForBroadcastRequest({
      type: 'broadcast',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForBroadcastRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['broadcastRequest', 'popupWindowId']);
  }

  return true;
};

const processGetSignaturesResponse = (response: any) => {
  if (!responseCallbackForGetSignaturesRequest) throw Error('Missing callback!');
  try {
    responseCallbackForGetSignaturesRequest({
      type: 'getSignatures',
      success: !response?.error,
      data: response?.sigResponses ?? [],
      error: response?.error,
    });
  } catch (error) {
    responseCallbackForGetSignaturesRequest({
      type: 'getSignatures',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForGetSignaturesRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['getSignaturesRequest', 'popupWindowId']);
  }

  return true;
};

const processEncryptResponse = (response: any) => {
  if (!responseCallbackForEncryptRequest) throw Error('Missing callback!');
  try {
    responseCallbackForEncryptRequest({
      type: 'encrypt',
      success: true,
      data: response.encryptedMessages,
    });
  } catch (error) {
    responseCallbackForEncryptRequest({
      type: 'encrypt',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForEncryptRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['encryptRequest', 'popupWindowId']);
  }

  return true;
};

const processDecryptResponse = (response: any) => {
  if (!responseCallbackForDecryptRequest) throw Error('Missing callback!');
  try {
    responseCallbackForDecryptRequest({
      type: 'decrypt',
      success: true,
      data: response.decryptedMessages,
    });
  } catch (error) {
    responseCallbackForDecryptRequest({
      type: 'decrypt',
      success: false,
      error: JSON.stringify(error),
    });
  } finally {
    responseCallbackForDecryptRequest = null;
    popupWindowId = undefined;
    chrome.storage.local.remove(['decryptRequest', 'popupWindowId']);
  }

  return true;
};

// HANDLE WINDOW CLOSE *****************************************

chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === popupWindowId) {
    if (responseCallbackForConnectRequest) {
      responseCallbackForConnectRequest({
        type: 'connect',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForConnectRequest = null;
      chrome.storage.local.remove('connectRequest');
    }

    if (responseCallbackForSendBsvRequest) {
      responseCallbackForSendBsvRequest({
        type: 'sendBsv',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForSendBsvRequest = null;
      chrome.storage.local.remove('sendBsvRequest');
    }

    if (responseCallbackForSignMessageRequest) {
      responseCallbackForSignMessageRequest({
        type: 'signMessage',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForSignMessageRequest = null;
      chrome.storage.local.remove('signMessageRequest');
    }

    if (responseCallbackForTransferOrdinalRequest) {
      responseCallbackForTransferOrdinalRequest({
        type: 'transferOrdinal',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForTransferOrdinalRequest = null;
      chrome.storage.local.remove('transferOrdinalRequest');
    }

    if (responseCallbackForPurchaseOrdinalRequest) {
      responseCallbackForPurchaseOrdinalRequest({
        type: 'purchaseOrdinal',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForPurchaseOrdinalRequest = null;
      chrome.storage.local.remove('purchaseOrdinalRequest');
    }

    if (responseCallbackForBroadcastRequest) {
      responseCallbackForBroadcastRequest({
        type: 'broadcast',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForBroadcastRequest = null;
      chrome.storage.local.remove('broadcastRequest');
    }

    if (responseCallbackForGetSignaturesRequest) {
      responseCallbackForGetSignaturesRequest({
        type: 'getSignatures',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForGetSignaturesRequest = null;
      chrome.storage.local.remove('getSignaturesRequest');
    }

    if (responseCallbackForGenerateTaggedKeysRequest) {
      responseCallbackForGenerateTaggedKeysRequest({
        type: 'generateTaggedKeys',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForGenerateTaggedKeysRequest = null;
      chrome.storage.local.remove('generateTaggedKeysRequest');
    }

    if (responseCallbackForEncryptRequest) {
      responseCallbackForEncryptRequest({
        type: 'encrypt',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForEncryptRequest = null;
      chrome.storage.local.remove('encryptRequest');
    }

    if (responseCallbackForDecryptRequest) {
      responseCallbackForDecryptRequest({
        type: 'decrypt',
        success: false,
        error: 'User dismissed the request!',
      });
      responseCallbackForDecryptRequest = null;
      chrome.storage.local.remove('decryptRequest');
    }

    popupWindowId = undefined;
    chrome.storage.local.remove('popupWindowId');
  }
});