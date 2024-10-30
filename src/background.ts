/* global chrome */
import {
  EncryptRequest,
  GetSignatures,
  PubKeys,
  SendBsv,
  SendBsvResponse,
  SignedMessage,
  TransferOrdinal,
  DecryptRequest,
  PurchaseOrdinal,
  SignatureResponse,
  TaggedDerivationRequest,
  TaggedDerivationResponse,
  GetTaggedKeysRequest,
  Broadcast,
  InscribeRequest,
  SignMessage,
  NetWork,
  SendBsv20Response,
  SendBsv20,
  GetPaginatedOrdinals,
} from 'yours-wallet-provider';
import {
  CustomListenerName,
  Decision,
  RequestParams,
  ResponseEventDetail,
  SerializedBsv20,
  WhitelistedApp,
  YoursEventName,
} from './inject';
import { EncryptResponse } from './pages/requests/EncryptRequest';
import { DecryptResponse } from './pages/requests/DecryptRequest';
import { removeWindow } from './utils/chromeHelpers';
import { GetSignaturesResponse } from './pages/requests/GetSignaturesRequest';
import { ChromeStorageObject, ConnectRequest } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { GorillaPoolService } from './services/GorillaPool.service';
import { mapOrdinal } from './utils/providerHelper';
import { TxoLookup, TxoSort } from 'spv-store';
import { initOneSatSPV } from './initSPVStore';
import { HOSTED_YOURS_IMAGE } from './utils/constants';
let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;
const gorillaPoolService = new GorillaPoolService(chromeStorageService);

export let oneSatSPVPromise = chromeStorageService
  .getAndSetStorage()
  .then(() => initOneSatSPV(chromeStorageService, isInServiceWorker));

console.log('Yours Wallet Background Script Running!');

const WOC_BASE_URL = 'https://api.whatsonchain.com/v1/bsv';

type CallbackResponse = (response: ResponseEventDetail) => void;

let responseCallbackForConnectRequest: CallbackResponse | null = null;
let responseCallbackForSendBsvRequest: CallbackResponse | null = null;
let responseCallbackForSendBsv20Request: CallbackResponse | null = null;
let responseCallbackForTransferOrdinalRequest: CallbackResponse | null = null;
let responseCallbackForPurchaseOrdinalRequest: CallbackResponse | null = null;
let responseCallbackForSignMessageRequest: CallbackResponse | null = null;
let responseCallbackForBroadcastRequest: CallbackResponse | null = null;
let responseCallbackForGetSignaturesRequest: CallbackResponse | null = null;
let responseCallbackForGenerateTaggedKeysRequest: CallbackResponse | null = null;
let responseCallbackForEncryptRequest: CallbackResponse | null = null;
let responseCallbackForDecryptRequest: CallbackResponse | null = null;
let popupWindowId: number | undefined;

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

// only run in background worker
if (isInServiceWorker) {
  const processSyncUtxos = async () => {
    try {
      const oneSatSPV = await oneSatSPVPromise;
      if (!oneSatSPV) throw Error('SPV not initialized!');
      await chromeStorageService.update({ hasUpgradedToSPV: true });
      await oneSatSPV.sync();
      console.log('done importing');
    } catch (error) {
      console.error('Error during sync:', error);
    }
  };

  const deleteAllIDBDatabases = async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name?.startsWith('block')) continue;
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
        console.log(`Deleted database: ${db.name}`);
      }
    }

    console.log('All IndexedDB databases deleted.');
  };

  const signOut = async () => {
    await (await oneSatSPVPromise).destroy();
    await deleteAllIDBDatabases();
  };

  const switchAccount = async () => {
    await (await oneSatSPVPromise).destroy();
    chromeStorageService = new ChromeStorageService();
    await chromeStorageService.getAndSetStorage();
    oneSatSPVPromise = initOneSatSPV(chromeStorageService, isInServiceWorker);
  };

  const launchPopUp = () => {
    chrome.windows.create(
      {
        url: chrome.runtime.getURL('index.html'),
        type: 'popup',
        width: 392,
        height: 567,
      },
      (window) => {
        popupWindowId = window?.id;
        if (popupWindowId) {
          chrome.storage.local.set({
            popupWindowId,
          });
        }
      },
    );
  };

  const verifyAccess = async (requestingDomain: string): Promise<boolean> => {
    const { accounts, selectedAccount } = (await chromeStorageService.getAndSetStorage()) as ChromeStorageObject;
    if (!accounts || !selectedAccount) return false;
    const whitelist = accounts[selectedAccount].settings.whitelist;
    if (!whitelist) return false;
    return whitelist.map((i: WhitelistedApp) => i.domain).includes(requestingDomain);
  };

  const authorizeRequest = async (message: {
    action: YoursEventName;
    params: { domain: string };
  }): Promise<boolean> => {
    if (
      message.action === YoursEventName.QUEUE_STATUS_UPDATE ||
      message.action === YoursEventName.IMPORT_STATUS_UPDATE ||
      message.action === YoursEventName.FETCHING_TX_STATUS_UPDATE
    ) {
      return true;
    }
    const { params } = message;
    return await verifyAccess(params.domain);
  };

  // Function to create a notification with simulated transaction data every 5 seconds
  const sendTransactionNotification = () => {
    setInterval(() => {
      const newTransaction = {
        amount: '0.1',
        currency: 'BTC',
        time: new Date().toLocaleTimeString(),
      };

      // Create the Chrome notification
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl:
            'https://images.pexels.com/photos/674010/pexels-photo-674010.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
          title: 'New Transaction',
          message: `Transaction of ${newTransaction.amount} ${newTransaction.currency} confirmed at ${newTransaction.time}`,
          priority: 2,
        },
        (notificationId: any) => {
          if (chrome.runtime.lastError) {
            console.error('Notification error:', chrome.runtime.lastError.message || chrome.runtime.lastError);
          } else {
            console.log('Notification sent:', notificationId);
          }
        },
      );
    }, 8000);
  };
  sendTransactionNotification();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse: CallbackResponse) => {
    if ([YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT].includes(message.action)) {
      emitEventToActiveTabs(message);
    }

    const noAuthRequired = [
      YoursEventName.IS_CONNECTED,
      YoursEventName.USER_CONNECT_RESPONSE,
      YoursEventName.SEND_BSV_RESPONSE,
      YoursEventName.SEND_BSV20_RESPONSE,
      YoursEventName.TRANSFER_ORDINAL_RESPONSE,
      YoursEventName.PURCHASE_ORDINAL_RESPONSE,
      YoursEventName.SIGN_MESSAGE_RESPONSE,
      YoursEventName.BROADCAST_RESPONSE,
      YoursEventName.GET_SIGNATURES_RESPONSE,
      YoursEventName.GENERATE_TAGGED_KEYS_RESPONSE,
      YoursEventName.ENCRYPT_RESPONSE,
      YoursEventName.DECRYPT_RESPONSE,
      YoursEventName.SYNC_UTXOS,
      YoursEventName.SWITCH_ACCOUNT,
      YoursEventName.SIGNED_OUT,
    ];

    if (noAuthRequired.includes(message.action)) {
      switch (message.action) {
        case YoursEventName.IS_CONNECTED:
          return processIsConnectedRequest(message.params as { domain: string }, sendResponse);
        case YoursEventName.USER_CONNECT_RESPONSE:
          return processConnectResponse(message as { decision: Decision; pubKeys: PubKeys });
        case YoursEventName.SEND_BSV_RESPONSE:
          return processSendBsvResponse(message as SendBsvResponse);
        case YoursEventName.SEND_BSV20_RESPONSE:
          return processSendBsv20Response(message as SendBsv20Response);
        case YoursEventName.TRANSFER_ORDINAL_RESPONSE:
          return processTransferOrdinalResponse(message as { txid: string });
        case YoursEventName.PURCHASE_ORDINAL_RESPONSE:
          return processPurchaseOrdinalResponse(message as { txid: string });
        case YoursEventName.SIGN_MESSAGE_RESPONSE:
          return processSignMessageResponse(message as SignedMessage);
        case YoursEventName.BROADCAST_RESPONSE:
          return processBroadcastResponse(message as { txid: string });
        case YoursEventName.GET_SIGNATURES_RESPONSE:
          return processGetSignaturesResponse(message as GetSignaturesResponse);
        case YoursEventName.GENERATE_TAGGED_KEYS_RESPONSE:
          return processGenerateTaggedKeysResponse(message as TaggedDerivationResponse);
        case YoursEventName.ENCRYPT_RESPONSE:
          return processEncryptResponse(message as EncryptResponse);
        case YoursEventName.DECRYPT_RESPONSE:
          return processDecryptResponse(message as DecryptResponse);
        case YoursEventName.SYNC_UTXOS:
          return processSyncUtxos();
        case YoursEventName.SWITCH_ACCOUNT:
          return switchAccount();
        case YoursEventName.SIGNED_OUT:
          return signOut();
        default:
          break;
      }

      return;
    }

    authorizeRequest(message).then((isAuthorized) => {
      if (message.action === YoursEventName.CONNECT) {
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
        case YoursEventName.DISCONNECT:
          return processDisconnectRequest(message, sendResponse);
        case YoursEventName.GET_PUB_KEYS:
          return processGetPubKeysRequest(sendResponse);
        case YoursEventName.GET_BALANCE:
          return processGetBalanceRequest(sendResponse);
        case YoursEventName.GET_ADDRESSES:
          return processGetAddressesRequest(sendResponse);
        case YoursEventName.GET_NETWORK:
          return processGetNetworkRequest(sendResponse);
        case YoursEventName.GET_ORDINALS:
          return processGetOrdinalsRequest(message, sendResponse);
        case YoursEventName.GET_BSV20S:
          return processGetBsv20sRequest(sendResponse);
        case YoursEventName.SEND_BSV:
        case YoursEventName.INSCRIBE: // We use the sendBsv functionality here
          return processSendBsvRequest(message, sendResponse);
        case YoursEventName.SEND_BSV20:
          return processSendBsv20Request(message, sendResponse);
        case YoursEventName.TRANSFER_ORDINAL:
          return processTransferOrdinalRequest(message, sendResponse);
        case YoursEventName.PURCHASE_ORDINAL:
        case YoursEventName.PURCHASE_BSV20:
          return processPurchaseOrdinalRequest(message, sendResponse);
        case YoursEventName.SIGN_MESSAGE:
          return processSignMessageRequest(message, sendResponse);
        case YoursEventName.BROADCAST:
          return processBroadcastRequest(message, sendResponse);
        case YoursEventName.GET_SIGNATURES:
          return processGetSignaturesRequest(message, sendResponse);
        case YoursEventName.GET_SOCIAL_PROFILE:
          return processGetSocialProfileRequest(sendResponse);
        case YoursEventName.GET_PAYMENT_UTXOS:
          return processGetPaymentUtxos(sendResponse);
        case YoursEventName.GET_EXCHANGE_RATE:
          return processGetExchangeRate(sendResponse);
        case YoursEventName.GENERATE_TAGGED_KEYS:
          return processGenerateTaggedKeysRequest(message, sendResponse);
        case YoursEventName.GET_TAGGED_KEYS:
          return processGetTaggedKeys(message, sendResponse);
        case YoursEventName.ENCRYPT:
          return processEncryptRequest(message, sendResponse);
        case YoursEventName.DECRYPT:
          return processDecryptRequest(message, sendResponse);
        default:
          break;
      }
    });

    return true;
  });

  // EMIT EVENTS ********************************

  const emitEventToActiveTabs = (message: { action: YoursEventName; params: RequestParams }) => {
    const { action, params } = message;
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(function (tab: chrome.tabs.Tab) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: CustomListenerName.YOURS_EMIT_EVENT, action, params });
        }
      });
    });
    return true;
  };

  // REQUESTS ***************************************

  const processConnectRequest = (
    message: { params: RequestParams },
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
  ) => {
    responseCallbackForConnectRequest = sendResponse;
    chromeStorageService
      .update({
        connectRequest: { ...message.params, isAuthorized } as ConnectRequest,
      })
      .then(() => {
        launchPopUp();
      });

    return true;
  };

  const processDisconnectRequest = (message: { params: { domain: string } }, sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        const { whitelist } = account.settings;
        if (!whitelist) throw Error('Already disconnected!');
        const { params } = message;
        const updatedWhitelist = whitelist.filter((i: { domain: string }) => i.domain !== params.domain);
        const key: keyof ChromeStorageObject = 'accounts';
        const update: Partial<ChromeStorageObject['accounts']> = {
          [account.addresses.identityAddress]: {
            ...account,
            settings: {
              ...account.settings,
              whitelist: updatedWhitelist,
            },
          },
        };
        chromeStorageService.updateNested(key, update).then(() => {
          sendResponse({
            type: YoursEventName.DISCONNECT,
            success: true,
            data: true,
          });
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.DISCONNECT,
        success: true, // This is true in the catch because we want to return a boolean
        data: false,
      });
    }
  };

  const processIsConnectedRequest = (params: { domain: string }, sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const result = chromeStorageService.getCurrentAccountObject();
        if (!result?.account) throw Error('No account found!');
        const currentTime = Date.now();
        const lastActiveTime = result.lastActiveTime;

        sendResponse({
          type: YoursEventName.IS_CONNECTED,
          success: true,
          data:
            !result.isLocked &&
            currentTime - Number(lastActiveTime) < INACTIVITY_LIMIT &&
            result.account.settings.whitelist?.map((i: { domain: string }) => i.domain).includes(params.domain),
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.IS_CONNECTED,
        success: true, // This is true in the catch because we want to return a boolean
        error: false,
      });
    }

    return true;
  };

  const processGetBalanceRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        sendResponse({
          type: YoursEventName.GET_BALANCE,
          success: true,
          data: account.balance,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_BALANCE,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetPubKeysRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        sendResponse({
          type: YoursEventName.GET_PUB_KEYS,
          success: true,
          data: account.pubKeys,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_PUB_KEYS,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetAddressesRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        sendResponse({
          type: YoursEventName.GET_ADDRESSES,
          success: true,
          data: account.addresses,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_ADDRESSES,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetNetworkRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        sendResponse({
          type: YoursEventName.GET_NETWORK,
          success: true,
          data: account?.network ?? NetWork.Mainnet,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_NETWORK,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetOrdinalsRequest = (message: { params: GetPaginatedOrdinals }, sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(async () => {
        const oneSatSPV = await oneSatSPVPromise;
        if (!oneSatSPV) throw Error('SPV not initialized!');
        if (message.params.from === undefined || message.params.from === null) {
          const result = await oneSatSPV.search(new TxoLookup('origin'), TxoSort.DESC, 0);
          const mapped = result.txos.map(mapOrdinal);
          sendResponse({
            type: YoursEventName.GET_ORDINALS,
            success: true,
            data: mapped,
          });
        } else {
          const results = await oneSatSPV.search(
            new TxoLookup('origin'),
            TxoSort.DESC,
            message.params.limit || 50,
            message.params.from || '',
          );
          const mapped = results.txos.map(mapOrdinal);
          sendResponse({
            type: YoursEventName.GET_ORDINALS,
            success: true,
            data: { ordinals: mapped, from: results.nextPage },
          });
        }
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_ORDINALS,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetBsv20sRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(async () => {
        let data: SerializedBsv20[] = [];
        const obj = chromeStorageService.getCurrentAccountObject();
        if (obj.account?.addresses?.bsvAddress && obj.account?.addresses?.ordAddress) {
          const rawData = await gorillaPoolService.getBsv20Balances([
            obj.account?.addresses.bsvAddress,
            obj.account?.addresses.ordAddress,
          ]);

          data = rawData.map((d) => {
            return {
              ...d,
              listed: { confirmed: d.listed.confirmed.toString(), pending: d.listed.pending.toString() },
              all: { confirmed: d.all.confirmed.toString(), pending: d.all.pending.toString() },
            };
          });
        }

        sendResponse({
          type: YoursEventName.GET_BSV20S,
          success: true,
          data,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_BSV20S,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetExchangeRate = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(async (res) => {
        if (!res) throw Error('Could not get storage!');
        const { exchangeRateCache } = res;
        if (exchangeRateCache?.rate && Date.now() - exchangeRateCache.timestamp < 5 * 60 * 1000) {
          sendResponse({
            type: YoursEventName.GET_EXCHANGE_RATE,
            success: true,
            data: Number(exchangeRateCache.rate.toFixed(2)),
          });
        } else {
          const res = await fetch(`${WOC_BASE_URL}/main/exchangerate`);
          if (!res.ok) {
            throw new Error(`Fetch error: ${res.status} - ${res.statusText}`);
          }
          const data = await res.json();
          const rate = data.rate;
          const currentTime = Date.now();
          chromeStorageService.update({
            exchangeRateCache: { rate, timestamp: currentTime },
          });
          sendResponse({
            type: YoursEventName.GET_EXCHANGE_RATE,
            success: true,
            data: Number(rate.toFixed(2)),
          });
        }
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_EXCHANGE_RATE,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetPaymentUtxos = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(async () => {
        const oneSatSPV = await oneSatSPVPromise;
        if (!oneSatSPV) throw Error('SPV not initialized!');
        const results = await oneSatSPV.search(new TxoLookup('fund'));
        const utxos = results.txos.map((txo) => {
          return {
            txid: txo.outpoint.txid,
            vout: txo.outpoint.vout,
            satoshis: Number(txo.satoshis),
            script: Buffer.from(txo.script).toString('hex'),
          };
        });
        sendResponse({
          type: YoursEventName.GET_PAYMENT_UTXOS,
          success: true,
          data: utxos,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_PAYMENT_UTXOS,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  // Important note: We process the InscribeRequest as a SendBsv request.
  const processSendBsvRequest = (
    message: { params: { data: SendBsv[] | InscribeRequest[] } },
    sendResponse: CallbackResponse,
  ) => {
    if (!message.params.data) {
      sendResponse({
        type: YoursEventName.SEND_BSV,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForSendBsvRequest = sendResponse;
      let sendBsvRequest = message.params.data as SendBsv[];

      // If in this if block, it's an inscribe() request.
      const inscribeRequest = message.params.data as InscribeRequest[];
      if (inscribeRequest[0].base64Data) {
        sendBsvRequest = inscribeRequest.map((d: InscribeRequest) => {
          return {
            address: d.address,
            inscription: {
              base64Data: d.base64Data,
              mimeType: d.mimeType,
              map: d.map,
            },
            satoshis: d.satoshis ?? 1,
          } as SendBsv;
        });
      }

      chromeStorageService.update({ sendBsvRequest }).then(() => {
        launchPopUp();
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.SEND_BSV,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processSendBsv20Request = (message: { params: SendBsv20 }, sendResponse: CallbackResponse) => {
    console.log('processSendBsv20Request', message);
    if (!message.params) {
      sendResponse({
        type: YoursEventName.SEND_BSV20,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForSendBsv20Request = sendResponse;
      const sendBsv20Request = message.params;
      chromeStorageService.update({ sendBsv20Request }).then(() => {
        launchPopUp();
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.SEND_BSV20,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processTransferOrdinalRequest = (message: { params: TransferOrdinal }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.TRANSFER_ORDINAL,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForTransferOrdinalRequest = sendResponse;
      chromeStorageService
        .update({
          transferOrdinalRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.TRANSFER_ORDINAL,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processPurchaseOrdinalRequest = (message: { params: PurchaseOrdinal }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.PURCHASE_ORDINAL,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForPurchaseOrdinalRequest = sendResponse;
      chromeStorageService
        .update({
          purchaseOrdinalRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.PURCHASE_ORDINAL,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processBroadcastRequest = (message: { params: Broadcast }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.BROADCAST,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForBroadcastRequest = sendResponse;
      chromeStorageService
        .update({
          broadcastRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.BROADCAST,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processSignMessageRequest = (message: { params: SignMessage }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.SIGN_MESSAGE,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForSignMessageRequest = sendResponse;
      chromeStorageService
        .update({
          signMessageRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.SIGN_MESSAGE,
        success: false,
        error: JSON.stringify(error),
      });
    }

    return true;
  };

  const processGetSignaturesRequest = (message: { params: GetSignatures }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.GET_SIGNATURES,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForGetSignaturesRequest = sendResponse;
      chromeStorageService
        .update({
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
        type: YoursEventName.GET_SIGNATURES,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetSocialProfileRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        const displayName = account.settings?.socialProfile?.displayName ?? 'Anonymous';
        const avatar = account.settings?.socialProfile?.avatar ?? HOSTED_YOURS_IMAGE;
        sendResponse({
          type: YoursEventName.GET_SOCIAL_PROFILE,
          success: true,
          data: { displayName, avatar },
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_SOCIAL_PROFILE,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGenerateTaggedKeysRequest = (
    message: { params: TaggedDerivationRequest },
    sendResponse: CallbackResponse,
  ) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.GENERATE_TAGGED_KEYS,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForGenerateTaggedKeysRequest = sendResponse;
      chromeStorageService
        .update({
          generateTaggedKeysRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GENERATE_TAGGED_KEYS,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetTaggedKeys = async (
    message: { params: GetTaggedKeysRequest & { domain: string } },
    sendResponse: CallbackResponse,
  ) => {
    if (!message.params.label) {
      sendResponse({
        type: YoursEventName.GET_TAGGED_KEYS,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      chromeStorageService.getAndSetStorage().then((res) => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!res || !account) throw Error('No account found!');
        const { lastActiveTime, isLocked } = res;
        const { derivationTags } = account;
        const currentTime = Date.now();
        if (isLocked || currentTime - Number(lastActiveTime) > INACTIVITY_LIMIT) {
          sendResponse({
            type: YoursEventName.GET_TAGGED_KEYS,
            success: false,
            error: 'Unauthorized! Wallet is locked.',
          });
        }

        let returnData =
          derivationTags.length > 0
            ? derivationTags?.filter(
                (res: TaggedDerivationResponse) =>
                  res.tag.label === message.params.label && res.tag.domain === message.params.domain,
              )
            : [];

        if (returnData.length > 0 && (message?.params?.ids?.length ?? 0 > 0)) {
          returnData = returnData?.filter((d: TaggedDerivationResponse) => message?.params?.ids?.includes(d.tag.id));
        }

        sendResponse({
          type: YoursEventName.GET_TAGGED_KEYS,
          success: true,
          data: returnData,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_TAGGED_KEYS,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processEncryptRequest = (message: { params: EncryptRequest }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.ENCRYPT,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForEncryptRequest = sendResponse;
      chromeStorageService
        .update({
          encryptRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.ENCRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    }

    return true;
  };

  const processDecryptRequest = (message: { params: DecryptRequest }, sendResponse: CallbackResponse) => {
    if (!message.params) {
      sendResponse({
        type: YoursEventName.DECRYPT,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForDecryptRequest = sendResponse;
      chromeStorageService
        .update({
          decryptRequest: message.params,
        })
        .then(() => {
          launchPopUp();
        });
    } catch (error) {
      sendResponse({
        type: YoursEventName.DECRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    }

    return true;
  };

  // RESPONSES ********************************

  const cleanup = (types: YoursEventName[]) => {
    chromeStorageService.getAndSetStorage().then((res) => {
      if (res?.popupWindowId) {
        removeWindow(res.popupWindowId);
        chromeStorageService.remove([...types, 'popupWindowId']);
      }
    });
  };

  const processConnectResponse = (response: { decision: Decision; pubKeys: PubKeys }) => {
    if (!responseCallbackForConnectRequest) throw Error('Missing callback!');
    try {
      responseCallbackForConnectRequest({
        type: YoursEventName.CONNECT,
        success: true,
        data: response.decision === 'approved' ? response.pubKeys.identityPubKey : undefined,
      });
    } catch (error) {
      responseCallbackForConnectRequest?.({
        type: YoursEventName.CONNECT,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.CONNECT]);
    }

    return true;
  };

  const processSendBsvResponse = (response: SendBsvResponse) => {
    if (!responseCallbackForSendBsvRequest) throw Error('Missing callback!');
    try {
      responseCallbackForSendBsvRequest({
        type: YoursEventName.SEND_BSV,
        success: true,
        data: { txid: response.txid, rawtx: response.rawtx },
      });
    } catch (error) {
      responseCallbackForSendBsvRequest?.({
        type: YoursEventName.SEND_BSV,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.SEND_BSV]);
    }

    return true;
  };

  const processSendBsv20Response = (response: SendBsv20Response) => {
    if (!responseCallbackForSendBsv20Request) throw Error('Missing callback!');
    try {
      responseCallbackForSendBsv20Request({
        type: YoursEventName.SEND_BSV20,
        success: true,
        data: { txid: response.txid, rawtx: response.rawtx },
      });
    } catch (error) {
      responseCallbackForSendBsv20Request?.({
        type: YoursEventName.SEND_BSV20,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.SEND_BSV20]);
    }

    return true;
  };

  const processTransferOrdinalResponse = (response: { txid: string }) => {
    if (!responseCallbackForTransferOrdinalRequest) throw Error('Missing callback!');
    try {
      responseCallbackForTransferOrdinalRequest({
        type: YoursEventName.TRANSFER_ORDINAL,
        success: true,
        data: response?.txid,
      });
    } catch (error) {
      responseCallbackForTransferOrdinalRequest?.({
        type: YoursEventName.TRANSFER_ORDINAL,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.TRANSFER_ORDINAL]);
    }

    return true;
  };

  const processGenerateTaggedKeysResponse = (response: TaggedDerivationResponse) => {
    if (!responseCallbackForGenerateTaggedKeysRequest) throw Error('Missing callback!');
    try {
      responseCallbackForGenerateTaggedKeysRequest({
        type: YoursEventName.GENERATE_TAGGED_KEYS,
        success: true,
        data: {
          address: response?.address,
          pubKey: response?.pubKey,
          tag: response?.tag,
        },
      });
    } catch (error) {
      responseCallbackForGenerateTaggedKeysRequest?.({
        type: YoursEventName.GENERATE_TAGGED_KEYS,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.GENERATE_TAGGED_KEYS]);
    }

    return true;
  };

  const processPurchaseOrdinalResponse = (response: { txid: string }) => {
    if (!responseCallbackForPurchaseOrdinalRequest) throw Error('Missing callback!');
    try {
      responseCallbackForPurchaseOrdinalRequest({
        type: YoursEventName.PURCHASE_ORDINAL,
        success: true,
        data: response?.txid,
      });
    } catch (error) {
      responseCallbackForPurchaseOrdinalRequest?.({
        type: YoursEventName.PURCHASE_ORDINAL,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.PURCHASE_ORDINAL]);
    }

    return true;
  };

  const processSignMessageResponse = (response: SignedMessage) => {
    if (!responseCallbackForSignMessageRequest) throw Error('Missing callback!');
    try {
      responseCallbackForSignMessageRequest({
        type: YoursEventName.SIGN_MESSAGE,
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
      responseCallbackForSignMessageRequest?.({
        type: YoursEventName.SIGN_MESSAGE,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.SIGN_MESSAGE]);
    }

    return true;
  };

  const processBroadcastResponse = (response: { error?: string; txid?: string }) => {
    if (!responseCallbackForBroadcastRequest) throw Error('Missing callback!');
    try {
      if (response?.error) {
        responseCallbackForBroadcastRequest({
          type: YoursEventName.BROADCAST,
          success: false,
          error: response?.error,
        });
        return;
      }
      responseCallbackForBroadcastRequest({
        type: YoursEventName.BROADCAST,
        success: true,
        data: response?.txid,
      });
    } catch (error) {
      responseCallbackForBroadcastRequest?.({
        type: YoursEventName.BROADCAST,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.BROADCAST]);
    }

    return true;
  };

  const processGetSignaturesResponse = (response: { error?: string; sigResponses?: SignatureResponse[] }) => {
    if (!responseCallbackForGetSignaturesRequest) throw Error('Missing callback!');
    try {
      responseCallbackForGetSignaturesRequest({
        type: YoursEventName.GET_SIGNATURES,
        success: !response?.error,
        data: response?.sigResponses ?? [],
        error: response?.error,
      });
    } catch (error) {
      responseCallbackForGetSignaturesRequest?.({
        type: YoursEventName.GET_SIGNATURES,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.GET_SIGNATURES]);
    }

    return true;
  };

  const processEncryptResponse = (response: { encryptedMessages: string[] }) => {
    if (!responseCallbackForEncryptRequest) throw Error('Missing callback!');
    try {
      responseCallbackForEncryptRequest({
        type: YoursEventName.ENCRYPT,
        success: true,
        data: response.encryptedMessages,
      });
    } catch (error) {
      responseCallbackForEncryptRequest?.({
        type: YoursEventName.ENCRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.ENCRYPT]);
    }

    return true;
  };

  const processDecryptResponse = (response: { decryptedMessages: string[] }) => {
    if (!responseCallbackForDecryptRequest) throw Error('Missing callback!');
    try {
      responseCallbackForDecryptRequest({
        type: YoursEventName.DECRYPT,
        success: true,
        data: response.decryptedMessages,
      });
    } catch (error) {
      responseCallbackForDecryptRequest?.({
        type: YoursEventName.DECRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.DECRYPT]);
    }

    return true;
  };

  // HANDLE WINDOW CLOSE *****************************************
  chrome.windows.onRemoved.addListener((closedWindowId) => {
    if (closedWindowId === popupWindowId) {
      if (responseCallbackForConnectRequest) {
        responseCallbackForConnectRequest({
          type: YoursEventName.CONNECT,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForConnectRequest = null;
        chromeStorageService.remove('connectRequest');
      }

      if (responseCallbackForSendBsvRequest) {
        responseCallbackForSendBsvRequest({
          type: YoursEventName.SEND_BSV,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForSendBsvRequest = null;
        chromeStorageService.remove('sendBsvRequest');
      }

      if (responseCallbackForSendBsv20Request) {
        responseCallbackForSendBsv20Request({
          type: YoursEventName.SEND_BSV20,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForSendBsvRequest = null;
        chromeStorageService.remove('sendBsv20Request');
      }

      if (responseCallbackForSignMessageRequest) {
        responseCallbackForSignMessageRequest({
          type: YoursEventName.SIGN_MESSAGE,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForSignMessageRequest = null;
        chromeStorageService.remove('signMessageRequest');
      }

      if (responseCallbackForTransferOrdinalRequest) {
        responseCallbackForTransferOrdinalRequest({
          type: YoursEventName.TRANSFER_ORDINAL,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForTransferOrdinalRequest = null;
        chromeStorageService.remove('transferOrdinalRequest');
      }

      if (responseCallbackForPurchaseOrdinalRequest) {
        responseCallbackForPurchaseOrdinalRequest({
          type: YoursEventName.PURCHASE_ORDINAL,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForPurchaseOrdinalRequest = null;
        chromeStorageService.remove('purchaseOrdinalRequest');
      }

      if (responseCallbackForBroadcastRequest) {
        responseCallbackForBroadcastRequest({
          type: YoursEventName.BROADCAST,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForBroadcastRequest = null;
        chromeStorageService.remove('broadcastRequest');
      }

      if (responseCallbackForGetSignaturesRequest) {
        responseCallbackForGetSignaturesRequest({
          type: YoursEventName.GET_SIGNATURES,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForGetSignaturesRequest = null;
        chromeStorageService.remove('getSignaturesRequest');
      }

      if (responseCallbackForGenerateTaggedKeysRequest) {
        responseCallbackForGenerateTaggedKeysRequest({
          type: YoursEventName.GENERATE_TAGGED_KEYS,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForGenerateTaggedKeysRequest = null;
        chromeStorageService.remove('generateTaggedKeysRequest');
      }

      if (responseCallbackForEncryptRequest) {
        responseCallbackForEncryptRequest({
          type: YoursEventName.ENCRYPT,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForEncryptRequest = null;
        chromeStorageService.remove('encryptRequest');
      }

      if (responseCallbackForDecryptRequest) {
        responseCallbackForDecryptRequest({
          type: YoursEventName.DECRYPT,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForDecryptRequest = null;
        chromeStorageService.remove('decryptRequest');
      }

      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  });
}
