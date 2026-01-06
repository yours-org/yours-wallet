/* global chrome */
import { PubKeys } from 'yours-wallet-provider';
import {
  CustomListenerName,
  Decision,
  RequestParams,
  ResponseEventDetail,
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
  VerifySignatureArgs,
  VerifyHmacArgs,
  CreateActionArgs,
  SignActionArgs,
  AbortActionArgs,
  WalletEncryptArgs,
  WalletDecryptArgs,
  WalletInterface,
} from '@bsv/sdk';
import type {
  PermissionRequest,
  WalletPermissionsManager,
} from '@bsv/wallet-toolbox-mobile/out/src/index.client.js';
import {
  OneSatApi,
  type SendBsvRequest,
  type TransferOrdinalRequest,
  type ListOrdinalRequest,
  type InscribeRequest,
  type LockBsvRequest,
} from '@1sat/wallet-toolbox';
import type { ApprovalContext, YoursApprovalType } from './yoursApi';
import { removeWindow } from './utils/chromeHelpers';
import { ChromeStorageObject, ConnectRequest } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { initWallet, type AccountContext } from './initWallet';
import { HOSTED_YOURS_IMAGE } from './utils/constants';

let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;

// Account context - null if locked or not initialized
let accountContext: AccountContext | null = null;

/**
 * Send a balance update notification to the popup.
 * Uses the SYNC_STATUS_UPDATE event which useSyncTracker listens for.
 */
const notifyBalanceUpdate = () => {
  chrome.runtime.sendMessage({
    action: YoursEventName.SYNC_STATUS_UPDATE,
    data: { status: 'complete' },
  }).catch(() => {
    // Ignore errors if popup is not open
  });
};

// Initialize wallet on startup (will be null if locked)
const initializeWallet = async (): Promise<WalletInterface | null> => {
  console.log('[background] initializeWallet: starting, current accountContext:', !!accountContext);
  if (accountContext) {
    console.log('[background] initializeWallet: closing existing context');
    await accountContext?.close();
    accountContext = null;
  }

  console.log('[background] initializeWallet: calling initWallet...');
  accountContext = await initWallet(chromeStorageService, {
    onTransactionBroadcasted: (txid: string) => {
      console.log('[background] Transaction broadcasted:', txid);
      notifyBalanceUpdate();
    },
    onTransactionProven: (txid: string) => {
      console.log('[background] Transaction proven:', txid);
      notifyBalanceUpdate();
    },
  });
  console.log('[background] initializeWallet: initWallet returned, accountContext:', !!accountContext);

  if (accountContext) {
    bindPermissionCallbacks(accountContext.wallet);
    console.log('[background] initializeWallet: bound permission callbacks');
    console.log('[background] initializeWallet: remoteStorageConnected:', accountContext.remoteStorageConnected);
    // Sync is started in initWallet, events are forwarded to popup there
    // Remote storage retry happens naturally when service worker restarts
  }

  return accountContext?.wallet ?? null;
};

// Start initialization
chromeStorageService.getAndSetStorage().then(() => initializeWallet()).catch((error) => {
  // Log initialization errors - could be expected (locked wallet) or unexpected
  console.error('[background] Startup initialization failed:', error);
});

/**
 * Get the current wallet instance (WalletPermissionsManager).
 * Returns null if wallet is locked or not initialized.
 */
export const getWallet = (): WalletInterface | null => {
  console.log('[background] getWallet called, accountContext:', !!accountContext, 'wallet:', !!accountContext?.wallet);
  return accountContext?.wallet ?? null;
};

console.log('Yours Wallet Background Script Running!');

type CallbackResponse = (response: ResponseEventDetail) => void;

// Pending permission requests waiting for user approval
const pendingPermissionRequests = new Map<string, {
  request: PermissionRequest & { requestID: string };
  resolve: () => void;
  reject: (error: Error) => void;
}>();

// Pending transaction approval (YoursApi with custom UI)
// Only one pending approval at a time - new requests abort the previous one
let pendingTransactionApproval: {
  context: ApprovalContext;
  sendResponse: CallbackResponse;
  eventType: YoursEventName;
} | null = null;

// Callback for connect/auth flow (used by both yours.connect and CWI.waitForAuthentication)
let responseCallbackForConnectRequest: ((decision: Decision, pubKeys?: PubKeys) => void) | null = null;
let popupWindowId: number | undefined;

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

// Forward declaration for launchPopUp (defined inside isInServiceWorker block)
let launchPopUp: () => void = () => {
  console.warn('launchPopUp called before initialization');
};

/**
 * Bind permission callbacks to the WalletPermissionsManager.
 * These callbacks are triggered when an external app needs permission.
 */
const bindPermissionCallbacks = (manager: WalletPermissionsManager) => {
  // Protocol permission (signing, encrypting, HMAC, etc.)
  manager.bindCallback('onProtocolPermissionRequested', async (request: PermissionRequest & { requestID: string }) => {
    console.log('Protocol permission requested:', request);
    await showPermissionPrompt(request);
  });

  // Basket access permission (listing, inserting, removing outputs)
  manager.bindCallback('onBasketAccessRequested', async (request: PermissionRequest & { requestID: string }) => {
    console.log('Basket access requested:', request);
    await showPermissionPrompt(request);
  });

  // Certificate access permission
  manager.bindCallback('onCertificateAccessRequested', async (request: PermissionRequest & { requestID: string }) => {
    console.log('Certificate access requested:', request);
    await showPermissionPrompt(request);
  });

  // Spending authorization
  manager.bindCallback('onSpendingAuthorizationRequested', async (request: PermissionRequest & { requestID: string }) => {
    console.log('Spending authorization requested:', request);
    await showPermissionPrompt(request);
  });
};

/**
 * Show a permission prompt popup and wait for user response.
 * Returns a promise that resolves when user grants permission or rejects when denied.
 */
const showPermissionPrompt = (request: PermissionRequest & { requestID: string }): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Store the pending request
    pendingPermissionRequests.set(request.requestID, { request, resolve, reject });

    // Store request details in chrome storage for popup to read
    chromeStorageService.update({
      permissionRequest: request,
    }).then(() => {
      launchPopUp();
    });
  });
};

// only run in background worker
if (isInServiceWorker) {
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
    await accountContext?.close();
    accountContext = null;
    await deleteAllIDBDatabases();
  };

  const switchAccount = async () => {
    console.log('[background] switchAccount: starting');
    try {
      // Close existing wallet before switching
      if (accountContext) {
        console.log('[background] switchAccount: closing existing wallet');
        await accountContext.close();
        accountContext = null;
      }
      chromeStorageService = new ChromeStorageService();
      await chromeStorageService.getAndSetStorage();
      console.log('[background] switchAccount: storage loaded, initializing wallet');
      await initializeWallet();
      console.log('[background] switchAccount: wallet initialized successfully');
    } catch (error) {
      console.error('[background] switchAccount: failed to initialize wallet:', error);
    }
  };

  launchPopUp = () => {
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

  const verifyAccess = async (requestingOriginator: string): Promise<boolean> => {
    // Extension popup always has access (uses chrome-extension://<id> format)
    const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
    console.log('[verifyAccess] requestingOriginator:', requestingOriginator, 'extensionOrigin:', extensionOrigin);
    if (requestingOriginator === extensionOrigin) {
      console.log('[verifyAccess] Authorized: extension popup');
      return true;
    }

    const { accounts, selectedAccount } = (await chromeStorageService.getAndSetStorage()) as ChromeStorageObject;
    console.log('[verifyAccess] accounts:', !!accounts, 'selectedAccount:', selectedAccount);
    if (!accounts || !selectedAccount) return false;
    const whitelist = accounts[selectedAccount].settings.whitelist;
    console.log('[verifyAccess] whitelist:', whitelist?.map((i: WhitelistedApp) => i.domain));
    if (!whitelist) return false;
    // External sites use hostname as originator, check against whitelist
    return whitelist.map((i: WhitelistedApp) => i.domain).includes(requestingOriginator);
  };

  const authorizeRequest = async (message: {
    action: YoursEventName | CWIEventName;
    originator?: string;
  }): Promise<boolean> => {
    return await verifyAccess(message.originator || '');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse: CallbackResponse) => {
    console.log('[background] Received message:', message.action, 'originator:', message.originator);

    // Handle yours wallet events that should be broadcast
    if ([YoursEventName.SIGNED_OUT, YoursEventName.SWITCH_ACCOUNT].includes(message.action)) {
      emitEventToActiveTabs(message);
    }

    // Actions that don't require authorization
    const noAuthRequired = [
      YoursEventName.USER_CONNECT_RESPONSE,
      YoursEventName.SWITCH_ACCOUNT,
      YoursEventName.SIGNED_OUT,
      // CWI auth check (no auth required - just checks status)
      CWIEventName.IS_AUTHENTICATED,
      // Legacy yours.isConnected() check (no auth required - just checks status)
      YoursEventName.IS_CONNECTED,
      // Permission response from popup
      'PERMISSION_RESPONSE',
      // Transaction approval response from popup
      YoursEventName.TRANSACTION_APPROVAL_RESPONSE,
      // Internal UI requests (no external domain)
      YoursEventName.GET_PUB_KEYS,
      YoursEventName.GET_LEGACY_ADDRESSES,
      YoursEventName.GET_RECEIVE_ADDRESS,
      YoursEventName.GET_SOCIAL_PROFILE,
      // Wallet unlock - reinitialize after user enters password
      'WALLET_UNLOCKED',
    ];

    if (noAuthRequired.includes(message.action)) {
      switch (message.action) {
        case YoursEventName.USER_CONNECT_RESPONSE:
          return processConnectResponse(message as { decision: Decision; pubKeys: PubKeys });
        case YoursEventName.SWITCH_ACCOUNT:
          return switchAccount();
        case YoursEventName.SIGNED_OUT:
          return signOut();
        // CWI auth check
        case CWIEventName.IS_AUTHENTICATED:
          return processCWIIsAuthenticated(message.originator, sendResponse);
        // Legacy yours.isConnected() check
        case YoursEventName.IS_CONNECTED:
          return processIsConnected(message.originator, sendResponse);
        // Permission response from popup UI
        case 'PERMISSION_RESPONSE':
          return processPermissionResponse(message as { requestID: string; granted: boolean; expiry?: number });
        // Transaction approval response from popup UI
        case YoursEventName.TRANSACTION_APPROVAL_RESPONSE:
          return processTransactionApprovalResponse(message as { approved: boolean });
        // Internal UI requests (no external domain, direct from popup)
        case YoursEventName.GET_PUB_KEYS:
          processGetPubKeysRequest(sendResponse);
          return true;
        case YoursEventName.GET_LEGACY_ADDRESSES:
          processGetLegacyAddressesRequest(sendResponse);
          return true;
        case YoursEventName.GET_RECEIVE_ADDRESS:
          processGetReceiveAddressRequest(sendResponse);
          return true;
        case YoursEventName.GET_SOCIAL_PROFILE:
          processGetSocialProfileRequest(sendResponse);
          return true;
        case 'WALLET_UNLOCKED':
          // Reinitialize wallet after user unlocks with password
          chromeStorageService.getAndSetStorage().then(() => {
            initializeWallet().then((wallet) => {
              sendResponse({ type: 'WALLET_UNLOCKED', success: !!wallet });
            }).catch((error: Error) => {
              console.error('Failed to initialize wallet:', error);
              sendResponse({ type: 'WALLET_UNLOCKED', success: false, error: error.message });
            });
          });
          return true;
        default:
          break;
      }

      return;
    }

    authorizeRequest(message).then((isAuthorized) => {
      // CWI waitForAuthentication - same flow as connect
      if (message.action === CWIEventName.WAIT_FOR_AUTHENTICATION) {
        return processCWIWaitForAuthentication(message, sendResponse, isAuthorized);
      }

      // Legacy yours.connect() flow
      if (message.action === YoursEventName.CONNECT) {
        console.log('[background] Processing connect request, isAuthorized:', isAuthorized);
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
        // CWI (BRC-100) handlers - direct passthrough to wallet
        // WalletPermissionsManager handles permission prompts internally
        case CWIEventName.LIST_OUTPUTS:
          processCWIListOutputs(message, sendResponse);
          return true;
        case CWIEventName.GET_NETWORK:
          processCWIGetNetwork(sendResponse);
          return true;
        case CWIEventName.GET_HEIGHT:
          processCWIGetHeight(sendResponse);
          return true;
        case CWIEventName.GET_HEADER_FOR_HEIGHT:
          processCWIGetHeaderForHeight(message, sendResponse);
          return true;
        case CWIEventName.GET_VERSION:
          processCWIGetVersion(sendResponse);
          return true;
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
        case CWIEventName.CREATE_SIGNATURE:
          processCWICreateSignature(message, sendResponse);
          return true;
        case CWIEventName.ENCRYPT:
          processCWIEncrypt(message, sendResponse);
          return true;
        case CWIEventName.DECRYPT:
          processCWIDecrypt(message, sendResponse);
          return true;
        case CWIEventName.CREATE_ACTION:
          processCWICreateAction(message, sendResponse);
          return true;
        case CWIEventName.SIGN_ACTION:
          processCWISignAction(message, sendResponse);
          return true;
        case CWIEventName.ABORT_ACTION:
          processCWIAbortAction(message, sendResponse);
          return true;

        // YoursApi handlers (custom approval UI with transaction preview)
        case YoursEventName.YOURS_SEND_BSV:
          processYoursSendBsv(message, sendResponse);
          return true;
        case YoursEventName.YOURS_SEND_ALL_BSV:
          processYoursSendAllBsv(message, sendResponse);
          return true;
        case YoursEventName.YOURS_TRANSFER_ORDINAL:
          processYoursTransferOrdinal(message, sendResponse);
          return true;
        case YoursEventName.YOURS_LIST_ORDINAL:
          processYoursListOrdinal(message, sendResponse);
          return true;
        case YoursEventName.YOURS_INSCRIBE:
          processYoursInscribe(message, sendResponse);
          return true;
        case YoursEventName.YOURS_LOCK_BSV:
          processYoursLockBsv(message, sendResponse);
          return true;

        default:
          break;
      }
    });

    return true;
  });

  // PERMISSION RESPONSE HANDLER ********************************

  const processPermissionResponse = (response: { requestID: string; granted: boolean; expiry?: number }) => {
    const pending = pendingPermissionRequests.get(response.requestID);
    if (!pending) {
      console.warn('No pending permission request found for:', response.requestID);
      return;
    }

    pendingPermissionRequests.delete(response.requestID);

    if (response.granted) {
      // Grant the permission through the manager
      accountContext?.wallet.grantPermission({
        requestID: response.requestID,
        expiry: response.expiry,
        ephemeral: !response.expiry, // If no expiry, it's ephemeral (one-time)
      }).then(() => {
        pending.resolve();
      }).catch((error) => {
        pending.reject(error);
      });
    } else {
      // Deny the permission
      accountContext?.wallet.denyPermission(response.requestID).then(() => {
        pending.reject(new Error('Permission denied by user'));
      }).catch((error) => {
        pending.reject(error);
      });
    }

    // Clean up and close popup
    chromeStorageService.remove('permissionRequest');
    chromeStorageService.getAndSetStorage().then((res) => {
      if (res?.popupWindowId) {
        removeWindow(res.popupWindowId);
        chromeStorageService.remove('popupWindowId');
      }
    });

    return true;
  };

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

  // YOURS-SPECIFIC HANDLERS ********************************

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

  const processGetLegacyAddressesRequest = (sendResponse: CallbackResponse) => {
    try {
      chromeStorageService.getAndSetStorage().then(() => {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) throw Error('No account found!');
        sendResponse({
          type: YoursEventName.GET_LEGACY_ADDRESSES,
          success: true,
          data: account.addresses,
        });
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_LEGACY_ADDRESSES,
        success: false,
        error: JSON.stringify(error),
      });
    }
  };

  const processGetReceiveAddressRequest = (sendResponse: CallbackResponse) => {
    try {
      if (!accountContext) {
        sendResponse({
          type: YoursEventName.GET_RECEIVE_ADDRESS,
          success: false,
          error: 'Wallet not initialized',
        });
        return;
      }
      const address = accountContext.syncContext.addressManager.getPrimaryAddress();
      sendResponse({
        type: YoursEventName.GET_RECEIVE_ADDRESS,
        success: true,
        data: address,
      });
    } catch (error) {
      sendResponse({
        type: YoursEventName.GET_RECEIVE_ADDRESS,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
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

  // CWI (BRC-100) HANDLERS ********************************
  // All handlers are now direct passthroughs - WalletPermissionsManager handles permission prompts

  // Shared helper: if already authorized, respond immediately; otherwise launch popup
  const handleConnectOrAuth = (
    request: ConnectRequest,
    _sendResponse: CallbackResponse,
    isAuthorized: boolean,
    setCallback: () => void,
    immediateResponse: () => void,
  ) => {
    if (isAuthorized) {
      immediateResponse();
      return true;
    }
    setCallback();
    chromeStorageService.update({ connectRequest: request }).then(() => {
      launchPopUp();
    });
    return true;
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

  const processCWIIsAuthenticated = (
    originator: string | undefined,
    sendResponse: CallbackResponse,
  ) => {
    checkIsAuthenticated(originator)
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
    message: { params: RequestParams; originator?: string },
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
  ) => {
    const domain = message.originator;
    return handleConnectOrAuth(
      {
        domain: domain || 'unknown',
        appName: domain || 'Unknown App',
        appIcon: HOSTED_YOURS_IMAGE,
        isAuthorized,
      } as ConnectRequest,
      sendResponse,
      isAuthorized,
      () => {
        // Wrap sendResponse to format CWI response
        responseCallbackForConnectRequest = (decision: Decision) => {
          if (decision === 'approved') {
            sendResponse({
              type: CWIEventName.WAIT_FOR_AUTHENTICATION,
              success: true,
              data: { authenticated: true },
            });
          } else {
            sendResponse({
              type: CWIEventName.WAIT_FOR_AUTHENTICATION,
              success: false,
              error: 'User declined the connection request',
            });
          }
        };
      },
      () => {
        sendResponse({
          type: CWIEventName.WAIT_FOR_AUTHENTICATION,
          success: true,
          data: { authenticated: true },
        });
      },
    );
  };

  const processConnectRequest = (
    message: { params: RequestParams; originator?: string },
    sendResponse: CallbackResponse,
    isAuthorized: boolean,
  ) => {
    const domain = message.originator;
    const appName = message.params?.appName;
    const appIcon = message.params?.appIcon;

    return handleConnectOrAuth(
      {
        domain: domain || 'unknown',
        appName: appName || domain || 'Unknown App',
        appIcon: appIcon || HOSTED_YOURS_IMAGE,
        isAuthorized,
      } as ConnectRequest,
      sendResponse,
      isAuthorized,
      () => {
        // Wrap sendResponse to format legacy connect response
        responseCallbackForConnectRequest = (decision: Decision, pubKeys?: PubKeys) => {
          console.log('[processConnectRequest callback] decision:', decision, 'pubKeys:', pubKeys, 'identityPubKey:', pubKeys?.identityPubKey);
          if (decision === 'approved' && pubKeys) {
            sendResponse({
              type: YoursEventName.CONNECT,
              success: true,
              data: pubKeys.identityPubKey,
            });
          } else {
            sendResponse({
              type: YoursEventName.CONNECT,
              success: false,
              error: 'User declined the connection request',
            });
          }
        };
      },
      () => {
        // Already authorized - return the identity pubkey
        chromeStorageService.getAndSetStorage().then(() => {
          const { account } = chromeStorageService.getCurrentAccountObject();
          sendResponse({
            type: YoursEventName.CONNECT,
            success: true,
            data: account?.pubKeys?.identityPubKey,
          });
        });
      },
    );
  };

  const processIsConnected = (originator: string | undefined, sendResponse: CallbackResponse) => {
    checkIsAuthenticated(originator)
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

  // Direct passthrough handlers - wallet handles permissions internally
  const processCWIListOutputs = async (
    message: { params: ListOutputsArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.listOutputs(message.params, message.originator);
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
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.getNetwork({});
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
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.getHeight({});
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
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.getHeaderForHeight(message.params);
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
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.getVersion({});
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

  const processCWIGetPublicKey = async (
    message: { params: GetPublicKeyArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.getPublicKey(message.params, message.originator);
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
    message: { params: ListActionsArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.listActions(message.params, message.originator);
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
    message: { params: VerifySignatureArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.verifySignature(message.params, message.originator);
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
    message: { params: VerifyHmacArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.verifyHmac(message.params, message.originator);
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

  // Signing operations - wallet handles permission prompts internally via callbacks
  const processCWICreateSignature = async (
    message: { params: CreateSignatureArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      // WalletPermissionsManager will trigger callbacks if permission is needed
      const result = await w.createSignature(message.params, message.originator);
      sendResponse({
        type: CWIEventName.CREATE_SIGNATURE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.CREATE_SIGNATURE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIEncrypt = async (
    message: { params: WalletEncryptArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.encrypt(message.params, message.originator);
      sendResponse({
        type: CWIEventName.ENCRYPT,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.ENCRYPT,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIDecrypt = async (
    message: { params: WalletDecryptArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.decrypt(message.params, message.originator);
      sendResponse({
        type: CWIEventName.DECRYPT,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.DECRYPT,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWICreateAction = async (
    message: { params: CreateActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      // WalletPermissionsManager will trigger spending authorization callback if needed
      const result = await w.createAction(message.params, message.originator);
      sendResponse({
        type: CWIEventName.CREATE_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.CREATE_ACTION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWISignAction = async (
    message: { params: SignActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.signAction(message.params, message.originator);
      sendResponse({
        type: CWIEventName.SIGN_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.SIGN_ACTION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIAbortAction = async (
    message: { params: AbortActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) throw Error('Wallet not initialized!');

      const result = await w.abortAction(message.params, message.originator);
      sendResponse({
        type: CWIEventName.ABORT_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.ABORT_ACTION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  // YOURS API HANDLERS ********************************
  // These use OneSatApi builders + two-step createAction/signAction flow with custom approval UI

  /**
   * Generate a unique request ID for approval tracking
   */
  const generateRequestId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  };

  /**
   * Get or create OneSatApi instance for the current wallet
   */
  const getOneSatApi = (): OneSatApi | null => {
    const w = getWallet();
    if (!w) return null;
    return new OneSatApi(w);
  };

  /**
   * Abort any pending transaction approval and release UTXOs
   */
  const abortPendingApproval = async () => {
    if (pendingTransactionApproval) {
      const { context, sendResponse, eventType } = pendingTransactionApproval;

      // Abort the pending action to release UTXOs
      if (context.walletReference) {
        try {
          const w = getWallet();
          if (w) {
            await w.abortAction({ reference: context.walletReference });
          }
        } catch (e) {
          console.warn('Failed to abort pending action:', e);
        }
      }

      // Send rejection response to the previous request
      sendResponse({
        type: eventType,
        success: false,
        error: 'Request superseded by new transaction',
      });

      pendingTransactionApproval = null;
    }
  };

  /**
   * Generic handler for YoursApi transactional methods
   * Implements the two-step createAction/signAction flow with approval UI
   */
  const processYoursTransaction = async <TRequest>(
    eventType: YoursEventName,
    approvalType: YoursApprovalType,
    request: TRequest,
    buildParams: () => Promise<{ params: { description?: string }; error?: string }>,
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = getWallet();
      if (!w) {
        sendResponse({ type: eventType, success: false, error: 'Wallet not initialized!' });
        return;
      }

      // Build the CreateActionArgs using OneSatApi builder
      const buildResult = await buildParams();
      if (buildResult.error || !buildResult.params) {
        sendResponse({ type: eventType, success: false, error: buildResult.error || 'Failed to build transaction' });
        return;
      }

      const params = buildResult.params;

      // Step 1: Create action with signAndProcess=false to get signable transaction
      const createResult = await w.createAction({
        ...params,
        description: params.description || 'Transaction',
        options: { signAndProcess: false },
      });

      if (!createResult.signableTransaction) {
        sendResponse({ type: eventType, success: false, error: 'No signable transaction returned' });
        return;
      }

      const { reference, tx } = createResult.signableTransaction;

      // Abort any pending approval before starting a new one
      await abortPendingApproval();

      // Build approval context
      const context: ApprovalContext = {
        requestId: generateRequestId(),
        type: approvalType,
        description: params.description || `${approvalType} transaction`,
        createActionParams: params as import('@1sat/wallet-toolbox').CreateActionArgs,
        walletReference: reference,
        signableTransactionBEEF: tx,
        originalRequest: request,
      };

      // Store pending approval
      pendingTransactionApproval = { context, sendResponse, eventType };

      // Store approval context in chrome storage for popup to read
      await chromeStorageService.update({ transactionApprovalRequest: context });

      // Launch approval popup
      launchPopUp();

    } catch (error) {
      sendResponse({
        type: eventType,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const processYoursSendBsv = async (
    message: { params: { data: SendBsvRequest[] } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_SEND_BSV, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_SEND_BSV,
      'sendBsv',
      message.params.data,
      async () => {
        const result = api.buildSendBsv(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  const processYoursSendAllBsv = async (
    message: { params: { data: string } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_SEND_ALL_BSV, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_SEND_ALL_BSV,
      'sendAllBsv',
      message.params.data,
      async () => {
        const result = await api.buildSendAllBsv(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  const processYoursTransferOrdinal = async (
    message: { params: { data: TransferOrdinalRequest } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_TRANSFER_ORDINAL, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_TRANSFER_ORDINAL,
      'transferOrdinal',
      message.params.data,
      async () => {
        const result = await api.buildTransferOrdinal(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  const processYoursListOrdinal = async (
    message: { params: { data: ListOrdinalRequest } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_LIST_ORDINAL, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_LIST_ORDINAL,
      'listOrdinal',
      message.params.data,
      async () => {
        const result = await api.buildListOrdinal(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  const processYoursInscribe = async (
    message: { params: { data: InscribeRequest } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_INSCRIBE, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_INSCRIBE,
      'inscribe',
      message.params.data,
      async () => {
        const result = api.buildInscribe(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  const processYoursLockBsv = async (
    message: { params: { data: LockBsvRequest[] } },
    sendResponse: CallbackResponse,
  ) => {
    const api = getOneSatApi();
    if (!api) {
      sendResponse({ type: YoursEventName.YOURS_LOCK_BSV, success: false, error: 'Wallet not initialized!' });
      return;
    }

    await processYoursTransaction(
      YoursEventName.YOURS_LOCK_BSV,
      'lockBsv',
      message.params.data,
      async () => {
        const result = api.buildLockBsv(message.params.data);
        if ('error' in result) return { params: {}, error: result.error };
        return { params: result };
      },
      sendResponse,
    );
  };

  // TRANSACTION APPROVAL RESPONSE HANDLER ********************************

  const processTransactionApprovalResponse = async (response: { approved: boolean }) => {
    if (!pendingTransactionApproval) {
      console.warn('No pending transaction approval found');
      return;
    }

    const { context, sendResponse, eventType } = pendingTransactionApproval;
    pendingTransactionApproval = null;

    try {
      const w = getWallet();
      if (!w) {
        sendResponse({ type: eventType, success: false, error: 'Wallet not initialized!' });
        return;
      }

      if (response.approved && context.walletReference) {
        // User approved - sign and broadcast the transaction
        const signResult = await w.signAction({ reference: context.walletReference, spends: {} });

        if (!signResult.txid) {
          sendResponse({ type: eventType, success: false, error: 'No txid returned from signAction' });
          return;
        }

        sendResponse({
          type: eventType,
          success: true,
          data: { txid: signResult.txid },
        });
      } else {
        // User rejected - abort the action to release UTXOs
        if (context.walletReference) {
          await w.abortAction({ reference: context.walletReference });
        }

        sendResponse({
          type: eventType,
          success: false,
          error: 'User rejected the transaction',
        });
      }
    } catch (error) {
      sendResponse({
        type: eventType,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      // Clean up chrome storage and close popup
      chromeStorageService.remove('transactionApprovalRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
        }
      });
    }
  };

  // CONNECT RESPONSE ********************************

  const processConnectResponse = (response: { decision: Decision; pubKeys: PubKeys }) => {
    console.log('[processConnectResponse] decision:', response.decision, 'pubKeys:', response.pubKeys, 'hasCallback:', !!responseCallbackForConnectRequest);
    if (!responseCallbackForConnectRequest) {
      console.error('[processConnectResponse] Missing callback!');
      return true;
    }
    try {
      responseCallbackForConnectRequest(response.decision, response.pubKeys);
    } catch (error) {
      console.error('Error in connect response callback:', error);
    } finally {
      responseCallbackForConnectRequest = null;
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove(['connectRequest', 'popupWindowId']);
        }
      });
    }

    return true;
  };

  // HANDLE WINDOW CLOSE *****************************************
  chrome.windows.onRemoved.addListener((closedWindowId) => {
    console.log('Window closed: ', closedWindowId);

    if (closedWindowId === popupWindowId) {
      if (responseCallbackForConnectRequest) {
        responseCallbackForConnectRequest('declined');
        responseCallbackForConnectRequest = null;
        chromeStorageService.remove('connectRequest');
      }

      // Deny any pending permission requests when popup is closed
      for (const [requestID, pending] of pendingPermissionRequests) {
        accountContext?.wallet.denyPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingPermissionRequests.clear();
      chromeStorageService.remove('permissionRequest');

      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  });
}
