/* global chrome */
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
  GroupedPermissionRequest,
  GroupedPermissions,
  CounterpartyPermissionRequest,
  CounterpartyPermissions,
  WalletPermissionsManager,
} from '@bsv/wallet-toolbox-mobile';
import { removeWindow } from './utils/chromeHelpers';
import { ChromeStorageObject, ConnectRequest } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { initWallet, type AccountContext } from './initWallet';
import { HOSTED_YOURS_IMAGE } from './utils/constants';
import { WalletBackupService } from './backup/WalletBackupService';

let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;

// Account context - null if locked or not initialized
let accountContext: AccountContext | null = null;

/**
 * Send a balance update notification to the popup.
 * Uses the SYNC_STATUS_UPDATE event which useSyncTracker listens for.
 */
const notifyBalanceUpdate = () => {
  chrome.runtime
    .sendMessage({
      action: YoursEventName.SYNC_STATUS_UPDATE,
      data: { status: 'complete' },
    })
    .catch(() => {
      // Ignore errors if popup is not open
    });
};

// Initialize wallet on startup (will be null if locked)
const initializeWallet = async (): Promise<WalletInterface | null> => {
  console.log('[background] initializeWallet: starting, current accountContext:', !!accountContext);
  if (accountContext) {
    console.log('[background] initializeWallet: closing existing context');
    try {
      await accountContext.close();
    } catch (error) {
      console.error('[background] initializeWallet: failed to close existing context (continuing anyway):', error);
    }
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

    // Check for pending restore data from Phase 1 of two-phase restore
    const hasPending = await WalletBackupService.hasPendingRestore();
    console.log('[background] initializeWallet: hasPendingRestore:', hasPending);
    if (hasPending) {
      console.log('[background] initializeWallet: Found pending restore data, importing...');
      try {
        const walletAny = accountContext.wallet as unknown as {
          underlying: { _storage: unknown };
        };
        const storage = walletAny.underlying?._storage;
        if (storage) {
          await WalletBackupService.importPendingWalletData(storage, (event) => {
            console.log('[background] PendingRestore:', event.message);
          });
          console.log('[background] initializeWallet: Pending restore complete');
        }
      } catch (error) {
        console.error('[background] initializeWallet: Pending restore failed:', error);
        // Clear the pending restore to avoid repeated failures
        await WalletBackupService.clearPendingRestore();
      }
    }
  }

  return accountContext?.wallet ?? null;
};

// Start initialization — clean up stale popup windows then initialize wallet.
// ensureWallet() awaits this so CWI messages don't launch popups during init.
const startupInitPromise = chromeStorageService
  .getAndSetStorage()
  .then(async () => {
    // Close any orphaned extension popup windows from a previous session/reload.
    const extOrigin = chrome.runtime.getURL('');
    const allWindows = await chrome.windows.getAll({ populate: true });
    for (const w of allWindows) {
      if (w.type === 'popup' && w.id && w.tabs?.some((t) => t.url?.startsWith(extOrigin))) {
        try {
          await chrome.windows.remove(w.id);
        } catch {
          // Window already gone
        }
      }
    }
    await chrome.storage.local.remove('popupWindowId');

    await initializeWallet();
  })
  .catch((error) => {
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

/**
 * Ensure the wallet is available, prompting user to unlock if needed.
 * Waits for startup initialization first so we don't launch a popup
 * while the wallet is still auto-initializing from a persisted passKey.
 */
const ensureWallet = async (): Promise<WalletInterface> => {
  await startupInitPromise;
  if (accountContext?.wallet) {
    return accountContext.wallet;
  }
  return new Promise((resolve, reject) => {
    pendingWalletWaiters.push({ resolve, reject });
    if (pendingWalletWaiters.length === 1) {
      launchPopUp();
    }
  });
};

console.log('Yours Wallet Background Script Running!');

type CallbackResponse = (response: ResponseEventDetail) => void;

// Pending permission requests waiting for user approval
const pendingPermissionRequests = new Map<
  string,
  {
    request: PermissionRequest & { requestID: string };
    resolve: () => void;
    reject: (error: Error) => void;
  }
>();

// Pending wallet initialization waiters (for ensureWallet when service worker wakes without passKey)
const pendingWalletWaiters: {
  resolve: (wallet: WalletInterface) => void;
  reject: (error: Error) => void;
}[] = [];

const pendingGroupedPermissionRequests = new Map<
  string,
  {
    request: GroupedPermissionRequest;
    resolve: () => void;
    reject: (error: Error) => void;
  }
>();

const pendingCounterpartyPermissionRequests = new Map<
  string,
  {
    request: CounterpartyPermissionRequest;
    resolve: () => void;
    reject: (error: Error) => void;
  }
>();

// Callback for CWI.waitForAuthentication flow
let responseCallbackForConnectRequest: ((decision: Decision) => void) | null = null;
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
  manager.bindCallback(
    'onSpendingAuthorizationRequested',
    async (request: PermissionRequest & { requestID: string }) => {
      console.log('Spending authorization requested:', request);
      await showPermissionPrompt(request);
    },
  );

  // Grouped permission (all permissions from manifest.json bundled)
  manager.bindCallback('onGroupedPermissionRequested', async (request: GroupedPermissionRequest) => {
    console.log('Grouped permission requested:', request);
    await showGroupedPermissionPrompt(request);
  });

  // Counterparty pact (level-2 protocols for a specific counterparty)
  manager.bindCallback('onCounterpartyPermissionRequested', async (request: CounterpartyPermissionRequest) => {
    console.log('Counterparty permission requested:', request);
    await showCounterpartyPermissionPrompt(request);
  });
};

/**
 * Show a permission prompt popup and wait for user response.
 * Returns a promise that resolves when user grants permission or rejects when denied.
 */
const showPermissionPrompt = (request: PermissionRequest & { requestID: string }): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingPermissionRequests.set(request.requestID, { request, resolve, reject });
    chromeStorageService.update({ permissionRequest: request }).then(() => {
      if (popupWindowId) {
        chrome.windows.update(popupWindowId, { focused: true }).catch(() => {
          popupWindowId = undefined;
          launchPopUp();
        });
      } else {
        launchPopUp();
      }
    });
  });
};

const showGroupedPermissionPrompt = (request: GroupedPermissionRequest): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingGroupedPermissionRequests.set(request.requestID, { request, resolve, reject });
    chromeStorageService.update({ groupedPermissionRequest: request }).then(() => {
      if (popupWindowId) {
        chrome.windows.update(popupWindowId, { focused: true }).catch(() => {
          popupWindowId = undefined;
          launchPopUp();
        });
      } else {
        launchPopUp();
      }
    });
  });
};

const showCounterpartyPermissionPrompt = (request: CounterpartyPermissionRequest): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingCounterpartyPermissionRequests.set(request.requestID, { request, resolve, reject });
    chromeStorageService.update({ counterpartyPermissionRequest: request }).then(() => {
      if (popupWindowId) {
        chrome.windows.update(popupWindowId, { focused: true }).catch(() => {
          popupWindowId = undefined;
          launchPopUp();
        });
      } else {
        launchPopUp();
      }
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

  const createNewPopup = () => {
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

  launchPopUp = () => {
    // Fast path: module-level variable still has the popup ID
    if (popupWindowId) {
      chrome.windows.update(popupWindowId, { focused: true }).catch(() => {
        popupWindowId = undefined;
        createNewPopup();
      });
      return;
    }
    // Module-level var is lost after service worker suspension; check storage
    chrome.storage.local.get('popupWindowId', (result) => {
      if (result.popupWindowId) {
        chrome.windows.update(result.popupWindowId, { focused: true })
          .then(() => {
            popupWindowId = result.popupWindowId;
          })
          .catch(() => {
            chrome.storage.local.remove('popupWindowId');
            createNewPopup();
          });
      } else {
        createNewPopup();
      }
    });
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
    console.log(
      '[verifyAccess] whitelist:',
      whitelist?.map((i: WhitelistedApp) => i.domain),
    );
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
      // Permission responses from popup
      'PERMISSION_RESPONSE',
      'GROUPED_PERMISSION_RESPONSE',
      'COUNTERPARTY_PERMISSION_RESPONSE',
      // Internal UI requests (no external domain)
      YoursEventName.GET_BALANCE,
      YoursEventName.GET_PUB_KEYS,
      YoursEventName.GET_LEGACY_ADDRESSES,
      YoursEventName.GET_RECEIVE_ADDRESS,
      YoursEventName.GET_SOCIAL_PROFILE,
      // Wallet unlock - reinitialize after user enters password
      'WALLET_UNLOCKED',
      // Master backup/restore
      'MASTER_BACKUP',
      'MASTER_RESTORE',
    ];

    if (noAuthRequired.includes(message.action)) {
      switch (message.action) {
        case YoursEventName.USER_CONNECT_RESPONSE:
          return processConnectResponse(message as { decision: Decision });
        case YoursEventName.SWITCH_ACCOUNT:
          return switchAccount();
        case YoursEventName.SIGNED_OUT:
          return signOut();
        // CWI auth check
        case CWIEventName.IS_AUTHENTICATED:
          return processCWIIsAuthenticated(message.originator, sendResponse);
        // Permission responses from popup UI
        case 'PERMISSION_RESPONSE':
          return processPermissionResponse(message as { requestID: string; granted: boolean; expiry?: number });
        case 'GROUPED_PERMISSION_RESPONSE':
          return processGroupedPermissionResponse(
            message as { requestID: string; granted: Partial<GroupedPermissions> | null; expiry?: number },
          );
        case 'COUNTERPARTY_PERMISSION_RESPONSE':
          return processCounterpartyPermissionResponse(
            message as { requestID: string; granted: Partial<CounterpartyPermissions> | null; expiry?: number },
          );
        // Internal UI requests (no external domain, direct from popup)
        case YoursEventName.GET_BALANCE:
          processGetBalanceRequest(sendResponse);
          return true;
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
          // If wallet context already exists and has pending requests, skip reinitialization
          // to preserve active CWI operations (e.g., createAction waiting for permission)
          if (accountContext && pendingPermissionRequests.size > 0) {
            console.log(
              '[background] WALLET_UNLOCKED: skipping reinitialization, pending requests:',
              pendingPermissionRequests.size,
            );
            sendResponse({ type: 'WALLET_UNLOCKED', success: true });
            return true;
          }
          // Reinitialize wallet after user unlocks with password
          chromeStorageService.getAndSetStorage().then(() => {
            initializeWallet()
              .then((wallet) => {
                sendResponse({ type: 'WALLET_UNLOCKED', success: !!wallet });
                // Resolve any CWI handlers waiting for the wallet.
                // Don't close the popup — the CWI flow may need it for a
                // follow-up permission prompt (shown on /bsv-wallet route).
                if (wallet && pendingWalletWaiters.length > 0) {
                  for (const waiter of pendingWalletWaiters.splice(0)) {
                    waiter.resolve(wallet);
                  }
                }
              })
              .catch((error: Error) => {
                console.error('Failed to initialize wallet:', error);
                sendResponse({ type: 'WALLET_UNLOCKED', success: false, error: error.message });
                for (const waiter of pendingWalletWaiters.splice(0)) {
                  waiter.reject(error);
                }
              });
          });
          return true;
        case 'MASTER_BACKUP':
          processMasterBackup(sendResponse);
          return true;
        case 'MASTER_RESTORE':
          processMasterRestore(message.fileData, message.password, sendResponse);
          return true;
        default:
          break;
      }

      return;
    }

    authorizeRequest(message).then((isAuthorized) => {
      // CWI waitForAuthentication
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
      // expiry defaults to 0 (never expires), ephemeral defaults to false (persist on-chain)
      accountContext?.wallet
        .grantPermission({
          requestID: response.requestID,
          expiry: response.expiry,
        })
        .then(() => {
          pending.resolve();
        })
        .catch((error) => {
          pending.reject(error);
        });
    } else {
      // Deny the permission
      accountContext?.wallet
        .denyPermission(response.requestID)
        .then(() => {
          pending.reject(new Error('Permission denied by user'));
        })
        .catch((error) => {
          pending.reject(error);
        });
    }

    chromeStorageService.remove('permissionRequest');
    closePermissionPopup();
    return true;
  };

  const processGroupedPermissionResponse = (response: {
    requestID: string;
    granted: Partial<GroupedPermissions> | null;
    expiry?: number;
  }) => {
    const pending = pendingGroupedPermissionRequests.get(response.requestID);
    if (!pending) {
      console.warn('No pending grouped permission request found for:', response.requestID);
      return;
    }

    pendingGroupedPermissionRequests.delete(response.requestID);

    if (response.granted) {
      accountContext?.wallet
        .grantGroupedPermission({
          requestID: response.requestID,
          granted: response.granted,
          expiry: response.expiry,
        })
        .then(() => {
          pending.resolve();
        })
        .catch((error) => {
          pending.reject(error);
        });
    } else {
      accountContext?.wallet
        .denyGroupedPermission(response.requestID)
        .then(() => {
          pending.reject(new Error('Grouped permission denied by user'));
        })
        .catch((error) => {
          pending.reject(error);
        });
    }

    chromeStorageService.remove('groupedPermissionRequest');
    closePermissionPopup();
    return true;
  };

  const processCounterpartyPermissionResponse = (response: {
    requestID: string;
    granted: Partial<CounterpartyPermissions> | null;
    expiry?: number;
  }) => {
    const pending = pendingCounterpartyPermissionRequests.get(response.requestID);
    if (!pending) {
      console.warn('No pending counterparty permission request found for:', response.requestID);
      return;
    }

    pendingCounterpartyPermissionRequests.delete(response.requestID);

    if (response.granted) {
      accountContext?.wallet
        .grantCounterpartyPermission({
          requestID: response.requestID,
          granted: response.granted,
          expiry: response.expiry,
        })
        .then(() => {
          pending.resolve();
        })
        .catch((error) => {
          pending.reject(error);
        });
    } else {
      accountContext?.wallet
        .denyCounterpartyPermission(response.requestID)
        .then(() => {
          pending.reject(new Error('Counterparty permission denied by user'));
        })
        .catch((error) => {
          pending.reject(error);
        });
    }

    chromeStorageService.remove('counterpartyPermissionRequest');
    closePermissionPopup();
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

  const processGetBalanceRequest = (sendResponse: CallbackResponse) => {
    if (!accountContext) {
      sendResponse({
        type: YoursEventName.GET_BALANCE,
        success: false,
        error: 'Wallet not initialized',
      });
      return;
    }
    accountContext.baseWallet
      .balance()
      .then((satoshis) => {
        sendResponse({
          type: YoursEventName.GET_BALANCE,
          success: true,
          data: satoshis,
        });
      })
      .catch((error) => {
        sendResponse({
          type: YoursEventName.GET_BALANCE,
          success: false,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
      });
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

  // MASTER BACKUP/RESTORE HANDLERS ********************************

  const processMasterBackup = async (sendResponse: CallbackResponse) => {
    try {
      if (!accountContext) {
        sendResponse({
          type: 'MASTER_BACKUP',
          success: false,
          error: 'Wallet not initialized',
        });
        return;
      }

      const network = chromeStorageService.getNetwork();
      const chain = network === 'mainnet' ? 'main' : 'test';
      const { account } = chromeStorageService.getCurrentAccountObject();
      const identityKey = account?.pubKeys?.identityPubKey || '';

      // Get the storage manager from the wallet
      // WalletPermissionsManager wraps the underlying Wallet, which has _storage
      const walletAny = accountContext.wallet as unknown as {
        underlying: { _storage: unknown };
      };
      const storage = walletAny.underlying?._storage;
      if (!storage) {
        sendResponse({
          type: 'MASTER_BACKUP',
          success: false,
          error: 'Storage manager not available',
        });
        return;
      }

      const blob = await WalletBackupService.exportToFile(
        storage,
        chromeStorageService,
        chain as 'main' | 'test',
        identityKey,
        (event) => {
          console.log('[MasterBackup]', event.message);
        },
      );

      // Convert blob to base64 for message passing
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      sendResponse({
        type: 'MASTER_BACKUP',
        success: true,
        data: base64Data,
      });
    } catch (error) {
      console.error('[MasterBackup] Error:', error);
      sendResponse({
        type: 'MASTER_BACKUP',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const processMasterRestore = async (fileData: string, password: string, sendResponse: CallbackResponse) => {
    try {
      // Convert base64 back to File
      const binaryString = atob(fileData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const file = new File([bytes], 'backup.zip', { type: 'application/zip' });

      // Restore Chrome storage with password validation
      console.log('[MasterRestore] Restoring from backup...');
      const manifest = await WalletBackupService.restoreChromeStorage(chromeStorageService, file, password, (event) => {
        console.log('[MasterRestore]', event.message);
      });

      // Refresh chrome storage service to pick up restored data (including passKey)
      await chromeStorageService.getAndSetStorage();
      console.log('[MasterRestore] Chrome storage refreshed, initializing wallet...');

      // Initialize wallet now that user is authenticated
      const wallet = await initializeWallet();
      console.log('[MasterRestore] Wallet initialized:', !!wallet);

      sendResponse({
        type: 'MASTER_RESTORE',
        success: true,
        manifest,
      });
    } catch (error) {
      console.error('[MasterRestore] Error:', error);
      sendResponse({
        type: 'MASTER_RESTORE',
        success: false,
        error: error instanceof Error ? error.message : String(error),
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

  const processCWIIsAuthenticated = (originator: string | undefined, sendResponse: CallbackResponse) => {
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

    const forwardToManager = async () => {
      try {
        const w = await ensureWallet();
        await w.waitForAuthentication({}, domain);
      } catch (e) {
        console.warn('[background] waitForAuthentication grouped flow error:', e);
      }
      sendResponse({
        type: CWIEventName.WAIT_FOR_AUTHENTICATION,
        success: true,
        data: { authenticated: true },
      });
    };

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
        responseCallbackForConnectRequest = (decision: Decision) => {
          if (decision === 'approved') {
            forwardToManager();
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
        forwardToManager();
      },
    );
  };

  // Direct passthrough handlers - wallet handles permissions internally
  const processCWIListOutputs = async (
    message: { params: ListOutputsArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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

  const processCWIGetHeaderForHeight = async (message: { params: GetHeaderArgs }, sendResponse: CallbackResponse) => {
    try {
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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
      const w = await ensureWallet();

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

  const closePermissionPopup = () => {
    if (popupWindowId) {
      removeWindow(popupWindowId);
      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  };

  const processCWICreateAction = async (
    message: { params: CreateActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();

      console.log('[createAction] Starting with originator:', message.originator);
      console.log(
        '[createAction] Params:',
        JSON.stringify({
          description: message.params.description,
          inputCount: message.params.inputs?.length ?? 0,
          outputCount: message.params.outputs?.length ?? 0,
          options: message.params.options,
          hasInputBEEF: !!message.params.inputBEEF,
          inputBEEFLength: message.params.inputBEEF?.length ?? 0,
        }),
      );

      // WalletPermissionsManager will trigger spending authorization callback if needed
      const result = await w.createAction(message.params, message.originator);
      console.log('[createAction] Success');
      sendResponse({
        type: CWIEventName.CREATE_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[createAction] Error:', errorName, errorMessage);
      if (errorStack) console.error('[createAction] Stack:', errorStack);
      sendResponse({
        type: CWIEventName.CREATE_ACTION,
        success: false,
        error: errorMessage,
      });
    }
    closePermissionPopup();
    return true;
  };

  const processCWISignAction = async (
    message: { params: SignActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();

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
    closePermissionPopup();
    return true;
  };

  const processCWIAbortAction = async (
    message: { params: AbortActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();

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

  // CONNECT RESPONSE ********************************

  const processConnectResponse = (response: { decision: Decision }) => {
    console.log(
      '[processConnectResponse] decision:',
      response.decision,
      'hasCallback:',
      !!responseCallbackForConnectRequest,
    );
    if (!responseCallbackForConnectRequest) {
      console.error('[processConnectResponse] Missing callback!');
      return true;
    }
    try {
      responseCallbackForConnectRequest(response.decision);
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

      for (const [requestID, pending] of pendingGroupedPermissionRequests) {
        accountContext?.wallet.denyGroupedPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingGroupedPermissionRequests.clear();
      chromeStorageService.remove('groupedPermissionRequest');

      for (const [requestID, pending] of pendingCounterpartyPermissionRequests) {
        accountContext?.wallet.denyCounterpartyPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingCounterpartyPermissionRequests.clear();
      chromeStorageService.remove('counterpartyPermissionRequest');

      // Reject any CWI handlers waiting for wallet unlock
      for (const waiter of pendingWalletWaiters.splice(0)) {
        waiter.reject(new Error('User dismissed the unlock request'));
      }

      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  });
}
