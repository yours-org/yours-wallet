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
  SendMNEEResponse,
  SendMNEE,
  LockRequest,
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
import { CWIEventName } from './cwi';
import type {
  ListOutputsArgs,
  ListActionsArgs,
  GetPublicKeyArgs,
  GetHeaderArgs,
  CreateSignatureArgs,
  CreateSignatureResult,
  VerifySignatureArgs,
  VerifyHmacArgs,
  CreateActionArgs,
  CreateActionResult,
  WalletEncryptArgs,
  WalletEncryptResult,
  WalletDecryptArgs,
  WalletDecryptResult,
} from '@bsv/sdk';
import { EncryptResponse } from './pages/requests/EncryptRequest';
import { DecryptResponse } from './pages/requests/DecryptRequest';
import { removeWindow, sendTransactionNotification } from './utils/chromeHelpers';
import { GetSignaturesResponse } from './pages/requests/GetSignaturesRequest';
import { ChromeStorageObject, ConnectRequest } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { initWallet } from './initWallet';
import type { OneSatWallet } from '@1sat/wallet-toolbox';
import { CHROME_STORAGE_OBJECT_VERSION, HOSTED_YOURS_IMAGE, MNEE_API_TOKEN } from './utils/constants';
import { convertLockReqToSendBsvReq } from './utils/tools';
import Mnee from '@mnee/ts-sdk';

// mnee instance for balance check
const mnee = new Mnee({ environment: 'production', apiKey: MNEE_API_TOKEN });

let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;

export let walletPromise: Promise<OneSatWallet> = chromeStorageService
  .getAndSetStorage()
  .then(() => initWallet(chromeStorageService, !isInServiceWorker));

console.log('Yours Wallet Background Script Running!');

const WOC_BASE_URL = 'https://api.whatsonchain.com/v1/bsv';

type CallbackResponse = (response: ResponseEventDetail) => void;

let responseCallbackForSendBsvRequest: CallbackResponse | null = null;
let responseCallbackForSendBsv20Request: CallbackResponse | null = null;
let responseCallbackForSendMNEERequest: CallbackResponse | null = null;
let responseCallbackForTransferOrdinalRequest: CallbackResponse | null = null;
let responseCallbackForPurchaseOrdinalRequest: CallbackResponse | null = null;
let responseCallbackForSignMessageRequest: CallbackResponse | null = null;
let responseCallbackForBroadcastRequest: CallbackResponse | null = null;
let responseCallbackForGetSignaturesRequest: CallbackResponse | null = null;
let responseCallbackForGenerateTaggedKeysRequest: CallbackResponse | null = null;
let responseCallbackForEncryptRequest: CallbackResponse | null = null;
let responseCallbackForDecryptRequest: CallbackResponse | null = null;
// CWI (BRC-100) callbacks
let responseCallbackForCWICreateSignature: CallbackResponse | null = null;
let responseCallbackForCWIEncrypt: CallbackResponse | null = null;
let responseCallbackForCWIDecrypt: CallbackResponse | null = null;
let responseCallbackForCWICreateAction: CallbackResponse | null = null;
let responseCallbackForConnectRequest: CallbackResponse | null = null;
let responseCallbackForCWIWaitForAuthentication: CallbackResponse | null = null;
let popupWindowId: number | undefined;

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

// only run in background worker
if (isInServiceWorker) {
  // TODO: Re-enable notifications after initial sync is complete
  // const initNewTxsListener = async () => {
  //   const wallet = await walletPromise;
  //   wallet.on('sync:parsed', (data: { internalizedCount: number }) => {
  //     if (data.internalizedCount > 0) {
  //       sendTransactionNotification(data.internalizedCount);
  //     }
  //   });
  // };
  // initNewTxsListener();

  const processSyncUtxos = async () => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');
      wallet.sync();
      console.log('sync started');
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
    (await walletPromise).close();
    await deleteAllIDBDatabases();
  };

  const switchAccount = async () => {
    (await walletPromise).close();
    chromeStorageService = new ChromeStorageService();
    await chromeStorageService.getAndSetStorage();
    walletPromise = initWallet(chromeStorageService, !isInServiceWorker);
    // initNewTxsListener();
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
    if (message.action === YoursEventName.SYNC_STATUS_UPDATE) {
      return true;
    }
    const { params } = message;
    return await verifyAccess(params.domain);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse: CallbackResponse) => {
    if ([YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT].includes(message.action)) {
      emitEventToActiveTabs(message);
    }

    // Broadcast sync status updates to all extension views (popup can't receive its own messages)
    if (message.action === YoursEventName.SYNC_STATUS_UPDATE) {
      chrome.runtime.sendMessage(message).catch(() => {
        // Ignore errors when no listeners
      });
      return;
    }

    const noAuthRequired = [
      YoursEventName.IS_CONNECTED,
      YoursEventName.USER_CONNECT_RESPONSE,
      YoursEventName.SEND_BSV_RESPONSE,
      YoursEventName.SEND_BSV20_RESPONSE,
      YoursEventName.SEND_MNEE_RESPONSE,
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
      // CWI auth check (no auth required - just checks status)
      CWIEventName.IS_AUTHENTICATED,
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
        case YoursEventName.SEND_MNEE_RESPONSE:
          return processSendMNEEResponse(message as SendMNEEResponse);
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
        // CWI auth check
        case CWIEventName.IS_AUTHENTICATED:
          return processCWIIsAuthenticated(message.params as { originator?: string }, sendResponse);
        default:
          break;
      }

      return;
    }

    authorizeRequest(message).then((isAuthorized) => {
      if (message.action === YoursEventName.CONNECT) {
        return processConnectRequest(message, sendResponse, isAuthorized);
      }

      // CWI waitForAuthentication - same flow as connect
      if (message.action === CWIEventName.WAIT_FOR_AUTHENTICATION) {
        return processCWIWaitForAuthentication(message, sendResponse, isAuthorized);
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
        case YoursEventName.GET_MNEE_BALANCE:
          return processGetMNEEBalanceRequest(sendResponse);
        case YoursEventName.GET_ADDRESSES:
          return processGetAddressesRequest(sendResponse);
        case YoursEventName.GET_NETWORK:
          return processGetNetworkRequest(sendResponse);
        case YoursEventName.GET_BSV20S:
          return processGetBsv20sRequest(sendResponse);
        case YoursEventName.SEND_BSV:
        case YoursEventName.INSCRIBE: // We use the sendBsv functionality here
        case YoursEventName.LOCK_BSV: // We use the sendBsv functionality here
          return processSendBsvRequest(message, sendResponse);
        case YoursEventName.SEND_BSV20:
          return processSendBsv20Request(message, sendResponse);
        case YoursEventName.SEND_MNEE:
          return processSendMNEERequest(message, sendResponse);
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

        // CWI (BRC-100) handlers
        // Note: async handlers must NOT be returned - call them and return true synchronously
        case CWIEventName.LIST_OUTPUTS:
          processCWIListOutputs(message, sendResponse);
          return true;
        case CWIEventName.GET_NETWORK:
          return processCWIGetNetwork(sendResponse);
        case CWIEventName.GET_HEIGHT:
          processCWIGetHeight(sendResponse);
          return true;
        case CWIEventName.GET_HEADER_FOR_HEIGHT:
          processCWIGetHeaderForHeight(message, sendResponse);
          return true;
        case CWIEventName.GET_VERSION:
          return processCWIGetVersion(sendResponse);
        case CWIEventName.GET_PUBLIC_KEY:
          processCWIGetPublicKey(message, sendResponse);
          return true;
        case CWIEventName.LIST_ACTIONS:
          processCWIListActions(message, sendResponse);
          return true;
        case CWIEventName.VERIFY_SIGNATURE:
          processCWIVerifySignature(message, sendResponse);
          return true;
        case CWIEventName.VERIFY_HMAC:
          processCWIVerifyHmac(message, sendResponse);
          return true;

        // CWI signing operations (require popup for password)
        case CWIEventName.CREATE_SIGNATURE:
          return processCWICreateSignatureRequest(message, sendResponse);
        case CWIEventName.ENCRYPT:
          return processCWIEncryptRequest(message, sendResponse);
        case CWIEventName.DECRYPT:
          return processCWIDecryptRequest(message, sendResponse);
        case CWIEventName.CREATE_ACTION:
          return processCWICreateActionRequest(message, sendResponse);

        // CWI response handlers (from popup)
        case CWIEventName.CREATE_SIGNATURE_RESPONSE:
          return processCWICreateSignatureResponse(message as CreateSignatureResult);
        case CWIEventName.CREATE_ACTION_RESPONSE:
          return processCWICreateActionResponse(message as CreateActionResult);
        case CWIEventName.ENCRYPT_RESPONSE:
          return processCWIEncryptResponse(message as WalletEncryptResult);
        case CWIEventName.DECRYPT_RESPONSE:
          return processCWIDecryptResponse(message as WalletDecryptResult);

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
          chrome.tabs.sendMessage(tab.id, {
            type: CustomListenerName.YOURS_EMIT_EVENT,
            action,
            params,
          });
        }
      });
    });
    return true;
  };

  // REQUESTS ***************************************

  // Shared helper: if already authorized, respond immediately; otherwise launch popup
  const handleConnectOrAuth = (
    request: ConnectRequest,
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
    setCallback: (cb: CallbackResponse) => void,
    immediateResponse: () => void,
  ) => {
    if (isAuthorized) {
      immediateResponse();
      return true;
    }
    setCallback(sendResponse);
    chromeStorageService.update({ connectRequest: request }).then(() => {
      launchPopUp();
    });
    return true;
  };

  const processConnectRequest = (
    message: { params: RequestParams },
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
  ) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    return handleConnectOrAuth(
      { ...message.params, isAuthorized } as ConnectRequest,
      sendResponse,
      isAuthorized,
      (cb) => { responseCallbackForConnectRequest = cb; },
      () => {
        sendResponse({
          type: YoursEventName.CONNECT,
          success: true,
          data: account?.pubKeys?.identityPubKey,
        });
      },
    );
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

  // Shared helper to check if a domain is authenticated
  const checkIsAuthenticated = async (domain?: string): Promise<boolean> => {
    await chromeStorageService.getAndSetStorage();
    const result = chromeStorageService.getCurrentAccountObject();
    if (!result?.account) return false;

    const currentTime = Date.now();
    const lastActiveTime = result.lastActiveTime;

    return (
      !result.isLocked &&
      currentTime - Number(lastActiveTime) < INACTIVITY_LIMIT &&
      (!domain || result.account.settings.whitelist?.map((i: { domain: string }) => i.domain).includes(domain))
    );
  };

  const processIsConnectedRequest = (params: { domain: string }, sendResponse: CallbackResponse) => {
    checkIsAuthenticated(params.domain)
      .then((isConnected) => {
        sendResponse({
          type: YoursEventName.IS_CONNECTED,
          success: true,
          data: isConnected,
        });
      })
      .catch(() => {
        sendResponse({
          type: YoursEventName.IS_CONNECTED,
          success: true,
          data: false,
        });
      });

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

  const processGetMNEEBalanceRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        mnee.balance(account.addresses.bsvAddress).then(({ amount, decimalAmount }) => {
          sendResponse({
            type: YoursEventName.GET_MNEE_BALANCE,
            success: true,
            data: { amount, decimalAmount },
          });
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_MNEE_BALANCE,
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

  const processGetBsv20sRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(async () => {
        const wallet = await walletPromise;
        const result = await wallet.listOutputs({
          basket: 'bsv21',
          includeTags: true,
          limit: 10000,
        });

        // Aggregate balances by token id, tracking confirmed (valid) vs pending
        // Tag format: id:{tokenId}:{status} where status is "valid", "invalid", or "pending"
        const balanceMap = new Map<
          string,
          {
            id: string;
            confirmed: bigint;
            pending: bigint;
            icon?: string;
            sym?: string;
            dec: number;
          }
        >();

        for (const o of result.outputs) {
          const idTag = o.tags?.find((t: string) => t.startsWith('id:'));
          const amtTag = o.tags?.find((t: string) => t.startsWith('amt:'))?.slice(4);
          const symTag = o.tags?.find((t: string) => t.startsWith('sym:'))?.slice(4);
          const iconTag = o.tags?.find((t: string) => t.startsWith('icon:'))?.slice(5);
          const decTag = o.tags?.find((t: string) => t.startsWith('dec:'))?.slice(4);

          if (!idTag || !amtTag) continue;

          // Parse id:{tokenId}:{status} - status is last segment after final colon
          const idContent = idTag.slice(3); // remove "id:" prefix
          const lastColonIdx = idContent.lastIndexOf(':');
          if (lastColonIdx === -1) continue;

          const tokenId = idContent.slice(0, lastColonIdx);
          const status = idContent.slice(lastColonIdx + 1);

          // Skip invalid tokens
          if (status === 'invalid') continue;

          const isConfirmed = status === 'valid';
          const amt = BigInt(amtTag);
          const dec = decTag ? parseInt(decTag, 10) : 0;

          const existing = balanceMap.get(tokenId);
          if (existing) {
            if (isConfirmed) {
              existing.confirmed += amt;
            } else {
              existing.pending += amt;
            }
          } else {
            balanceMap.set(tokenId, {
              id: tokenId,
              confirmed: isConfirmed ? amt : 0n,
              pending: isConfirmed ? 0n : amt,
              sym: symTag,
              icon: iconTag,
              dec,
            });
          }
        }

        // Convert to SerializedBsv20[] format
        const data: SerializedBsv20[] = Array.from(balanceMap.values()).map((b) => ({
          p: 'bsv-20',
          op: 'transfer',
          dec: b.dec,
          amt: (b.confirmed + b.pending).toString(),
          id: b.id,
          sym: b.sym,
          icon: b.icon,
          all: {
            confirmed: b.confirmed.toString(),
            pending: b.pending.toString(),
          },
          listed: {
            confirmed: '0',
            pending: '0',
          },
        }));

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
        const wallet = await walletPromise;
        if (!wallet) throw Error('Wallet not initialized!');
        const result = await wallet.listOutputs({ basket: 'fund', limit: 10000 });
        const utxos = result.outputs.map((output) => {
          const [txid, voutStr] = output.outpoint.split('.');
          return {
            txid,
            vout: parseInt(voutStr, 10),
            satoshis: output.satoshis,
            script: output.lockingScript || '',
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
    message: {
      params: { data: SendBsv[] | InscribeRequest[] | LockRequest[] };
    },
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

      // If in this if block, it's a lock() request.
      const lockRequest = message.params.data as LockRequest[];
      if (lockRequest[0].blockHeight) {
        sendBsvRequest = convertLockReqToSendBsvReq(lockRequest);
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

  const processSendMNEERequest = (message: { params: { data: SendMNEE[] } }, sendResponse: CallbackResponse) => {
    if (!message.params.data) {
      sendResponse({
        type: YoursEventName.SEND_MNEE,
        success: false,
        error: 'Must provide valid params!',
      });
      return;
    }
    try {
      responseCallbackForSendMNEERequest = sendResponse;
      const sendMNEERequest = message.params.data;
      chromeStorageService.update({ sendMNEERequest }).then(() => {
        launchPopUp();
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.SEND_MNEE,
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

  // CWI (BRC-100) HANDLERS ********************************

  const processCWIListOutputs = async (
    message: { params: ListOutputsArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.listOutputs(message.params);

      sendResponse({
        type: CWIEventName.LIST_OUTPUTS,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.LIST_OUTPUTS,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIGetNetwork = async (sendResponse: CallbackResponse) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.getNetwork({});
      sendResponse({
        type: CWIEventName.GET_NETWORK,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.GET_NETWORK,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIGetHeight = async (sendResponse: CallbackResponse) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.getHeight({});
      sendResponse({
        type: CWIEventName.GET_HEIGHT,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.GET_HEIGHT,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIGetHeaderForHeight = async (
    message: { params: GetHeaderArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.getHeaderForHeight(message.params);
      sendResponse({
        type: CWIEventName.GET_HEADER_FOR_HEIGHT,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.GET_HEADER_FOR_HEIGHT,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIGetVersion = async (sendResponse: CallbackResponse) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.getVersion({});
      sendResponse({
        type: CWIEventName.GET_VERSION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.GET_VERSION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIIsAuthenticated = (
    params: { originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    checkIsAuthenticated(params.originator)
      .then((isAuthenticated) => {
        sendResponse({
          type: CWIEventName.IS_AUTHENTICATED,
          success: true,
          data: { authenticated: isAuthenticated },
        });
      })
      .catch(() => {
        sendResponse({
          type: CWIEventName.IS_AUTHENTICATED,
          success: true,
          data: { authenticated: false },
        });
      });

    return true;
  };

  const processCWIWaitForAuthentication = (
    message: { params: { originator?: string } },
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
  ) => {
    const domain = message.params?.originator;
    return handleConnectOrAuth(
      {
        domain: domain || 'unknown',
        appName: domain || 'Unknown App',
        appIcon: HOSTED_YOURS_IMAGE,
        isAuthorized,
      } as ConnectRequest,
      sendResponse,
      isAuthorized,
      (cb) => { responseCallbackForCWIWaitForAuthentication = cb; },
      () => {
        sendResponse({
          type: CWIEventName.WAIT_FOR_AUTHENTICATION,
          success: true,
          data: { authenticated: true },
        });
      },
    );
  };

  const processCWIGetPublicKey = async (
    message: { params: GetPublicKeyArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.getPublicKey(message.params);
      sendResponse({
        type: CWIEventName.GET_PUBLIC_KEY,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.GET_PUBLIC_KEY,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIListActions = async (
    message: { params: ListActionsArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.listActions(message.params);

      sendResponse({
        type: CWIEventName.LIST_ACTIONS,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.LIST_ACTIONS,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIVerifySignature = async (
    message: { params: VerifySignatureArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.verifySignature(message.params);
      sendResponse({
        type: CWIEventName.VERIFY_SIGNATURE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.VERIFY_SIGNATURE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIVerifyHmac = async (
    message: { params: VerifyHmacArgs },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const wallet = await walletPromise;
      if (!wallet) throw Error('Wallet not initialized!');

      const result = await wallet.verifyHmac(message.params);
      sendResponse({
        type: CWIEventName.VERIFY_HMAC,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.VERIFY_HMAC,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  // CWI SIGNING REQUESTS ********************************

  const processCWICreateSignatureRequest = (
    message: { params: CreateSignatureArgs },
    sendResponse: CallbackResponse,
  ) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) {
      sendResponse({
        type: CWIEventName.CREATE_SIGNATURE,
        success: false,
        error: 'No account found!',
      });
      return true;
    }
    responseCallbackForCWICreateSignature = sendResponse;
    chromeStorageService
      .update({
        cwiCreateSignatureRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
    return true;
  };

  const processCWIEncryptRequest = (
    message: { params: WalletEncryptArgs },
    sendResponse: CallbackResponse,
  ) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) {
      sendResponse({
        type: CWIEventName.ENCRYPT,
        success: false,
        error: 'No account found!',
      });
      return true;
    }
    responseCallbackForCWIEncrypt = sendResponse;
    chromeStorageService
      .update({
        cwiEncryptRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
    return true;
  };

  const processCWIDecryptRequest = (
    message: { params: WalletDecryptArgs },
    sendResponse: CallbackResponse,
  ) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) {
      sendResponse({
        type: CWIEventName.DECRYPT,
        success: false,
        error: 'No account found!',
      });
      return true;
    }
    responseCallbackForCWIDecrypt = sendResponse;
    chromeStorageService
      .update({
        cwiDecryptRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
    return true;
  };

  const processCWICreateActionRequest = (
    message: { params: CreateActionArgs },
    sendResponse: CallbackResponse,
  ) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) {
      sendResponse({
        type: CWIEventName.CREATE_ACTION,
        success: false,
        error: 'No account found!',
      });
      return true;
    }
    responseCallbackForCWICreateAction = sendResponse;
    chromeStorageService
      .update({
        cwiCreateActionRequest: message.params,
      })
      .then(() => {
        launchPopUp();
      });
    return true;
  };

  // CWI SIGNING RESPONSES ********************************

  const processCWICreateSignatureResponse = (response: CreateSignatureResult) => {
    if (!responseCallbackForCWICreateSignature) throw Error('Missing callback!');
    try {
      responseCallbackForCWICreateSignature({
        type: CWIEventName.CREATE_SIGNATURE,
        success: true,
        data: response,
      });
    } catch (error) {
      responseCallbackForCWICreateSignature?.({
        type: CWIEventName.CREATE_SIGNATURE,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      responseCallbackForCWICreateSignature = null;
      chromeStorageService.remove('cwiCreateSignatureRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
        }
      });
    }
    return true;
  };

  const processCWIEncryptResponse = (response: WalletEncryptResult) => {
    if (!responseCallbackForCWIEncrypt) throw Error('Missing callback!');
    try {
      responseCallbackForCWIEncrypt({
        type: CWIEventName.ENCRYPT,
        success: true,
        data: response,
      });
    } catch (error) {
      responseCallbackForCWIEncrypt?.({
        type: CWIEventName.ENCRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      responseCallbackForCWIEncrypt = null;
      chromeStorageService.remove('cwiEncryptRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
        }
      });
    }
    return true;
  };

  const processCWIDecryptResponse = (response: WalletDecryptResult) => {
    if (!responseCallbackForCWIDecrypt) throw Error('Missing callback!');
    try {
      responseCallbackForCWIDecrypt({
        type: CWIEventName.DECRYPT,
        success: true,
        data: response,
      });
    } catch (error) {
      responseCallbackForCWIDecrypt?.({
        type: CWIEventName.DECRYPT,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      responseCallbackForCWIDecrypt = null;
      chromeStorageService.remove('cwiDecryptRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
        }
      });
    }
    return true;
  };

  const processCWICreateActionResponse = (response: CreateActionResult) => {
    if (!responseCallbackForCWICreateAction) throw Error('Missing callback!');
    try {
      responseCallbackForCWICreateAction({
        type: CWIEventName.CREATE_ACTION,
        success: true,
        data: response,
      });
    } catch (error) {
      responseCallbackForCWICreateAction?.({
        type: CWIEventName.CREATE_ACTION,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      responseCallbackForCWICreateAction = null;
      chromeStorageService.remove('cwiCreateActionRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
        }
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
    // Handle CWI waitForAuthentication callback if present
    if (responseCallbackForCWIWaitForAuthentication) {
      try {
        if (response.decision === 'approved') {
          responseCallbackForCWIWaitForAuthentication({
            type: CWIEventName.WAIT_FOR_AUTHENTICATION,
            success: true,
            data: { authenticated: true },
          });
        } else {
          responseCallbackForCWIWaitForAuthentication({
            type: CWIEventName.WAIT_FOR_AUTHENTICATION,
            success: false,
            error: 'User declined the connection request',
          });
        }
      } catch (error) {
        responseCallbackForCWIWaitForAuthentication?.({
          type: CWIEventName.WAIT_FOR_AUTHENTICATION,
          success: false,
          error: JSON.stringify(error),
        });
      } finally {
        responseCallbackForCWIWaitForAuthentication = null;
        cleanup([YoursEventName.CONNECT]);
      }
      return true;
    }

    // Handle legacy connect callback
    if (!responseCallbackForConnectRequest) throw Error('Missing callback!');
    try {
      if (response.decision === 'approved') {
        responseCallbackForConnectRequest({
          type: YoursEventName.CONNECT,
          success: true,
          data: response.pubKeys.identityPubKey,
        });
      } else {
        responseCallbackForConnectRequest({
          type: YoursEventName.CONNECT,
          success: false,
          error: 'User declined the connection request',
        });
      }
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

  const processSendMNEEResponse = (response: SendMNEEResponse) => {
    if (!responseCallbackForSendMNEERequest) throw Error('Missing callback!');
    try {
      responseCallbackForSendMNEERequest({
        type: YoursEventName.SEND_MNEE,
        success: true,
        data: { txid: response.txid, rawtx: response.rawtx },
      });
    } catch (error) {
      responseCallbackForSendMNEERequest?.({
        type: YoursEventName.SEND_MNEE,
        success: false,
        error: JSON.stringify(error),
      });
    } finally {
      cleanup([YoursEventName.SEND_MNEE]);
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
    console.log('Window closed: ', closedWindowId);
    localStorage.removeItem('walletImporting');

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

      if (responseCallbackForSendMNEERequest) {
        responseCallbackForSendMNEERequest({
          type: YoursEventName.SEND_MNEE,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForSendBsvRequest = null;
        chromeStorageService.remove('sendMNEERequest');
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

      // CWI (BRC-100) popup dismiss handlers
      if (responseCallbackForCWICreateSignature) {
        responseCallbackForCWICreateSignature({
          type: CWIEventName.CREATE_SIGNATURE,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForCWICreateSignature = null;
        chromeStorageService.remove('cwiCreateSignatureRequest');
      }

      if (responseCallbackForCWIEncrypt) {
        responseCallbackForCWIEncrypt({
          type: CWIEventName.ENCRYPT,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForCWIEncrypt = null;
        chromeStorageService.remove('cwiEncryptRequest');
      }

      if (responseCallbackForCWIDecrypt) {
        responseCallbackForCWIDecrypt({
          type: CWIEventName.DECRYPT,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForCWIDecrypt = null;
        chromeStorageService.remove('cwiDecryptRequest');
      }

      if (responseCallbackForCWICreateAction) {
        responseCallbackForCWICreateAction({
          type: CWIEventName.CREATE_ACTION,
          success: false,
          error: 'User dismissed the request!',
        });
        responseCallbackForCWICreateAction = null;
        chromeStorageService.remove('cwiCreateActionRequest');
      }

      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  });
}
