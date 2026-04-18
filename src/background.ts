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
  RelinquishOutputArgs,
  ListActionsArgs,
  GetPublicKeyArgs,
  GetHeaderArgs,
  CreateHmacArgs,
  CreateSignatureArgs,
  VerifySignatureArgs,
  VerifyHmacArgs,
  CreateActionArgs,
  SignActionArgs,
  AbortActionArgs,
  InternalizeActionArgs,
  WalletEncryptArgs,
  WalletDecryptArgs,
  RevealCounterpartyKeyLinkageArgs,
  RevealSpecificKeyLinkageArgs,
  AcquireCertificateArgs,
  ListCertificatesArgs,
  ProveCertificateArgs,
  RelinquishCertificateArgs,
  DiscoverByIdentityKeyArgs,
  DiscoverByAttributesArgs,
  WalletInterface,
} from '@bsv/sdk';
import type {
  PermissionRequest,
  GroupedPermissionRequest,
  GroupedPermissions,
  CounterpartyPermissionRequest,
  CounterpartyPermissions,
} from '@bsv/wallet-toolbox-mobile';
import type { LocalWalletPermissionsManager } from '@1sat/wallet-browser';
import { removeWindow } from './utils/chromeHelpers';
import { Account, ChromeStorageObject, ConnectRequest, StorageConfig } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { initWallet, type AccountContext } from './initWallet';
import { DEFAULT_STORAGE_REMOTE, HOSTED_YOURS_IMAGE } from './utils/constants';
import { WalletBackupService } from './backup/WalletBackupService';

let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;

// Account context - null if locked or not initialized
let accountContext: AccountContext | null = null;
// Set while wallet is reinitializing (e.g. account switch) to prevent
// ensureWallet from launching a popup during the transition.
let reinitPromise: Promise<WalletInterface | null> | null = null;

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
        // Use the WalletStorageManager directly from AccountContext. Cast through
        // `unknown` because WalletBackupService imports WalletStorageManager from
        // `@bsv/wallet-toolbox-mobile` while AccountContext uses `@bsv/wallet-toolbox`
        // (same runtime shape, different nested type identities).
        const storage = accountContext.storage as unknown as Parameters<
          typeof WalletBackupService.importPendingWalletData
        >[0];
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

    // Only initialize wallet if it's within the active session window.
    // If locked (inactive or manual lock), keys stay encrypted until the user unlocks.
    await chromeStorageService.getAndSetStorage();
    const { account, lastActiveTime, passKey } = chromeStorageService.getCurrentAccountObject();
    const isUnlocked =
      passKey && account?.encryptedKeys && lastActiveTime && Date.now() - Number(lastActiveTime) < getInactivityLimit();

    if (isUnlocked) {
      await initializeWallet();
    } else {
      console.log('[background] Wallet is locked on startup — skipping key decryption');
    }
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

  // If wallet is currently reinitializing (e.g. account switch), wait for that
  // instead of launching a popup.
  if (reinitPromise) {
    const wallet = await reinitPromise;
    if (wallet) return wallet;
  }

  // Still no context — check again after reinit may have completed
  if (accountContext?.wallet) {
    return accountContext.wallet;
  }

  // No accountContext — passKey is cleared on lock, so the user must enter their password.
  // Check if a wallet exists to unlock (encryptedKeys must be present).
  await chromeStorageService.getAndSetStorage();
  const { account } = chromeStorageService.getCurrentAccountObject();

  if (!account?.encryptedKeys) {
    return Promise.reject(new Error('No wallet exists - create wallet first'));
  }

  // Wallet exists but is locked — prompt user to unlock via popup
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

/** Read the user's configured lock timeout (defaults to 10 minutes). */
const getInactivityLimit = () => chromeStorageService.getLockTimeout();

// Periodic inactivity check — destroys decrypted keys when session expires.
// This runs even when the popup is closed, ensuring keys don't linger in the service worker.
chrome.alarms.create('inactivity-lock', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'inactivity-lock' || !accountContext) return;
  await chromeStorageService.getAndSetStorage();
  const { lastActiveTime } = chromeStorageService.getCurrentAccountObject();
  if (!lastActiveTime || Date.now() - Number(lastActiveTime) >= getInactivityLimit()) {
    console.log('[background] Inactivity detected — destroying wallet context and clearing passKey');
    try {
      await accountContext.close();
    } catch (err) {
      console.error('[background] Error closing wallet on inactivity:', err);
    }
    accountContext = null;
    await chromeStorageService.clearPassKey();
    await chromeStorageService.update({ isLocked: true });
  }
});

// Forward declaration for launchPopUp (defined inside isInServiceWorker block)
let launchPopUp: () => void = () => {
  console.warn('launchPopUp called before initialization');
};

/**
 * Bind permission callbacks to the WalletPermissionsManager.
 * These callbacks are triggered when an external app needs permission.
 */
const bindPermissionCallbacks = (manager: LocalWalletPermissionsManager) => {
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
  console.log('[background] showPermissionPrompt called, requestID:', request.requestID, 'type:', request.type);
  return new Promise((resolve, reject) => {
    pendingPermissionRequests.set(request.requestID, { request, resolve, reject });
    chromeStorageService.update({ permissionRequest: request }).then(() => {
      console.log('[background] showPermissionPrompt: storage updated, popupWindowId:', popupWindowId);
      if (popupWindowId) {
        chrome.windows.update(popupWindowId, { focused: true }).catch(() => {
          console.log('[background] showPermissionPrompt: existing popup gone, creating new');
          popupWindowId = undefined;
          launchPopUp();
        });
      } else {
        console.log('[background] showPermissionPrompt: no popup, launching new');
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
    const doSwitch = async () => {
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
        return accountContext?.wallet ?? null;
      } catch (error) {
        console.error('[background] switchAccount: failed to initialize wallet:', error);
        return null;
      } finally {
        reinitPromise = null;
      }
    };
    reinitPromise = doSwitch();
    await reinitPromise;
  };

  const createNewPopup = () => {
    console.log('[background] createNewPopup called');
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
    console.log('[background] launchPopUp called');
    // Check if any popup window with our extension URL is already open
    // This handles the case where Chrome's default_popup is already showing
    chrome.windows.getAll({ populate: true }, (windows) => {
      const existingPopup = windows.find(
        (w) => w.type === 'popup' && w.tabs?.some((tab) => tab.url?.startsWith(chrome.runtime.getURL(''))),
      );

      if (existingPopup) {
        // Focus existing popup instead of creating duplicate
        chrome.windows.update(existingPopup.id!, { focused: true });
        popupWindowId = existingPopup.id;
        return;
      }

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
          chrome.windows
            .update(result.popupWindowId, { focused: true })
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
    });
  };

  const verifyAccess = async (requestingOriginator: string): Promise<boolean> => {
    // Check if wallet is locked - locked wallets cannot authorize external requests
    const storage = (await chromeStorageService.getAndSetStorage()) as ChromeStorageObject;
    if (storage.isLocked) {
      return false;
    }

    // Extension popup always has access (uses chrome-extension://<id> format)
    const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
    if (requestingOriginator === extensionOrigin) {
      return true;
    }

    const { accounts, selectedAccount } = storage;
    if (!accounts || !selectedAccount) return false;
    const whitelist = accounts[selectedAccount].settings.whitelist;
    if (!whitelist) return false;
    return whitelist.map((i: WhitelistedApp) => i.domain).includes(requestingOriginator);
  };

  const authorizeRequest = async (message: {
    action: YoursEventName | CWIEventName;
    originator?: string;
  }): Promise<boolean> => {
    return await verifyAccess(message.originator || '');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse: CallbackResponse) => {
    console.log(
      '[background] Received message:',
      message.action,
      'originator:',
      message.originator,
      'from:',
      sender.origin,
    );

    // Check if message is from our own extension popup
    const isFromExtension = sender.origin?.startsWith(`chrome-extension://${chrome.runtime.id}`);

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
      // CWI discovery (no auth required - substrate detection ping)
      CWIEventName.GET_VERSION,
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
      // Wallet lock/unlock
      'WALLET_LOCKED',
      'WALLET_UNLOCKED',
      // Master backup/restore
      'MASTER_BACKUP',
      'MASTER_RESTORE',
      // Storage management (popup internal)
      'STORAGE_GET_INFO',
      'STORAGE_SYNC_BACKUPS',
      'STORAGE_SET_ACTIVE_STORAGE',
      'STORAGE_ADD_REMOTE',
      'STORAGE_REMOVE_REMOTE',
      // Permissions management (popup internal)
      'PERMISSIONS_LIST_ALL',
      'PERMISSIONS_QUERY_SPENT',
      'PERMISSIONS_REVOKE_ONE',
      'PERMISSIONS_REVOKE_ALL',
      // Settings (popup internal)
      'UPDATE_FEE_RATE',
    ];

    if (noAuthRequired.includes(message.action)) {
      switch (message.action) {
        case YoursEventName.USER_CONNECT_RESPONSE:
          return processConnectResponse(message as { decision: Decision });
        case YoursEventName.SWITCH_ACCOUNT:
          switchAccount()
            .then(() => {
              sendResponse({ type: YoursEventName.SWITCH_ACCOUNT, success: true });
            })
            .catch((error) => {
              sendResponse({ type: YoursEventName.SWITCH_ACCOUNT, success: false, error: String(error) });
            });
          return true;
        case YoursEventName.SIGNED_OUT:
          return signOut();
        // CWI auth check
        case CWIEventName.IS_AUTHENTICATED:
          return processCWIIsAuthenticated(message.originator, sendResponse);
        // CWI discovery - substrate detection ping, no wallet needed
        case CWIEventName.GET_VERSION:
          sendResponse({
            type: CWIEventName.GET_VERSION,
            success: true,
            data: { version: 'yours-wallet-1.0.0' },
          });
          return true;
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
        case 'WALLET_LOCKED': {
          // Destroy accountContext and clear passKey so keys cannot be decrypted without password
          const ctx = accountContext;
          accountContext = null; // Clear reference immediately to block new callers
          chromeStorageService.clearPassKey().catch(() => {});
          if (ctx) {
            ctx
              .close()
              .then(() => console.log('[background] Wallet locked — keys and passKey cleared'))
              .catch((err) => console.error('[background] Error closing wallet on lock:', err))
              .finally(() => sendResponse({ type: 'WALLET_LOCKED', success: true }));
          } else {
            sendResponse({ type: 'WALLET_LOCKED', success: true });
          }
          return true;
        }
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
              .then(async (wallet) => {
                // Mark wallet as unlocked in storage BEFORE resolving waiters,
                // so verifyAccess() sees the unlocked state when authorizing requests
                await chromeStorageService.update({ isLocked: false, lastActiveTime: Date.now() });

                sendResponse({ type: 'WALLET_UNLOCKED', success: !!wallet });

                const hadWaiters = pendingWalletWaiters.length > 0;
                // Resolve any CWI handlers waiting for the wallet
                if (wallet && hadWaiters) {
                  for (const waiter of pendingWalletWaiters.splice(0)) {
                    waiter.resolve(wallet);
                  }
                }
                // Don't close the popup if there's a pending connect request in storage
                // or if CWI handlers were waiting — the popup needs to transition
                // from the unlock screen to the connect/permission screen.
                const storage = await chromeStorageService.getAndSetStorage();
                const hasPendingRequest =
                  hadWaiters ||
                  !!(storage as Record<string, unknown>)?.connectRequest ||
                  !!(storage as Record<string, unknown>)?.permissionRequest ||
                  !!(storage as Record<string, unknown>)?.groupedPermissionRequest ||
                  !!(storage as Record<string, unknown>)?.counterpartyPermissionRequest;
                if (!hasPendingRequest && popupWindowId) {
                  removeWindow(popupWindowId);
                  popupWindowId = undefined;
                  chrome.storage.local.remove('popupWindowId');
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
        case 'STORAGE_GET_INFO':
          processStorageGetInfo(sendResponse);
          return true;
        case 'STORAGE_SYNC_BACKUPS':
          processStorageSyncBackups(sendResponse);
          return true;
        case 'STORAGE_SET_ACTIVE_STORAGE':
          processStorageSetActiveStorage(message.target, sendResponse);
          return true;
        case 'STORAGE_ADD_REMOTE':
          processStorageAddRemote(message.url, sendResponse);
          return true;
        case 'STORAGE_REMOVE_REMOTE':
          processStorageRemoveRemote(message.url, sendResponse);
          return true;
        case 'UPDATE_FEE_RATE': {
          const rate = message.feeRate;
          if (typeof rate === 'number' && rate >= 1 && accountContext) {
            // Access the internal storage provider to update fee model at runtime.
            // This reaches into WalletStorageManager internals — if the SDK changes
            // its structure, the guard below will catch it and log a warning.
            const active = (accountContext.storage as any)._active;
            if (active?.storage?.feeModel) {
              active.storage.feeModel = { model: 'sat/kb', value: rate };
            } else {
              console.warn(
                '[background] UPDATE_FEE_RATE: could not resolve storage._active.storage.feeModel —',
                'fee rate will apply on next wallet initialization',
              );
            }
          }
          sendResponse({ type: 'UPDATE_FEE_RATE', success: true });
          return true;
        }
        case 'PERMISSIONS_LIST_ALL':
          processPermissionsListAll(sendResponse);
          return true;
        case 'PERMISSIONS_QUERY_SPENT':
          processPermissionsQuerySpent(message, sendResponse);
          return true;
        case 'PERMISSIONS_REVOKE_ONE':
          processPermissionsRevokeOne(message, sendResponse);
          return true;
        case 'PERMISSIONS_REVOKE_ALL':
          processPermissionsRevokeAll(message, sendResponse);
          return true;
        default:
          break;
      }

      return;
    }

    // If message is from our own extension popup, check wallet state without launching popup
    // The popup handles its own UI (unlock/create wallet pages)
    if (isFromExtension) {
      const { account, passKey } = chromeStorageService.getCurrentAccountObject();
      const isWalletAvailable = account?.encryptedKeys && passKey;

      if (!isWalletAvailable) {
        sendResponse({
          type: message.action,
          success: false,
          error: 'Wallet not available',
        });
        return true;
      }
      // Wallet is available, continue to authorize
    }

    ensureWallet()
      .then(() => {
        console.log('[background] ensureWallet resolved for action:', message.action);
        return authorizeRequest(message);
      })
      .then((isAuthorized) => {
        console.log('[background] authorizeRequest result for', message.action, ':', isAuthorized);
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
          case CWIEventName.CREATE_HMAC:
            processCWICreateHmac(message, sendResponse);
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
          case CWIEventName.INTERNALIZE_ACTION:
            processCWIInternalizeAction(message, sendResponse);
            return true;
          case CWIEventName.RELINQUISH_OUTPUT:
            processCWIRelinquishOutput(message, sendResponse);
            return true;
          case CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE:
            processCWIRevealCounterpartyKeyLinkage(message, sendResponse);
            return true;
          case CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE:
            processCWIRevealSpecificKeyLinkage(message, sendResponse);
            return true;
          case CWIEventName.ACQUIRE_CERTIFICATE:
            processCWIAcquireCertificate(message, sendResponse);
            return true;
          case CWIEventName.LIST_CERTIFICATES:
            processCWIListCertificates(message, sendResponse);
            return true;
          case CWIEventName.PROVE_CERTIFICATE:
            processCWIProveCertificate(message, sendResponse);
            return true;
          case CWIEventName.RELINQUISH_CERTIFICATE:
            processCWIRelinquishCertificate(message, sendResponse);
            return true;
          case CWIEventName.DISCOVER_BY_IDENTITY_KEY:
            processCWIDiscoverByIdentityKey(message, sendResponse);
            return true;
          case CWIEventName.DISCOVER_BY_ATTRIBUTES:
            processCWIDiscoverByAttributes(message, sendResponse);
            return true;

          default:
            break;
        }
      })
      .catch((error: Error) => {
        sendResponse({
          type: message.action,
          success: false,
          error: error.message || 'Wallet unavailable',
        });
      });

    return true;
  });

  // STORAGE MANAGEMENT HANDLERS ********************************

  const processStorageGetInfo = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet();
    } catch (err) {
      sendResponse({
        type: 'STORAGE_GET_INFO',
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
    if (!accountContext) {
      sendResponse({ type: 'STORAGE_GET_INFO', success: false, error: 'Wallet not initialized' });
      return;
    }
    const { storage, remoteStorage } = accountContext;
    (async () => {
      try {
        const stores = storage.getStores();
        const settings = storage.getSettings();
        const activeStore = stores.find((s) => s.isActive);
        const backupStores = stores.filter((s) => s.isBackup);
        // Surface the persisted per-account config so the UI can render
        // from the same source of truth used at init time.
        const { account } = chromeStorageService.getCurrentAccountObject();
        const storageConfig: StorageConfig = account?.storageConfig ?? {
          activeRemote: DEFAULT_STORAGE_REMOTE,
          remotes: [DEFAULT_STORAGE_REMOTE],
        };

        let outputCount = 0;
        let transactionCount = 0;
        try {
          outputCount = await storage.runAsStorageProvider(async (sp) => sp.countOutputs({ partial: {} }));
          transactionCount = await storage.runAsStorageProvider(async (sp) => sp.countTransactions({ partial: {} }));
        } catch {
          // countOutputs/countTransactions may not be available on all providers
        }

        let syncStates: Array<{
          storageIdentityKey: string;
          storageName: string;
          status: string;
          when?: string;
        }> = [];
        try {
          const states = await storage.runAsStorageProvider(async (sp) => sp.findSyncStates({ partial: {} }));
          syncStates = states.map((s) => ({
            storageIdentityKey: s.storageIdentityKey,
            storageName: s.storageName,
            status: s.status,
            when: s.when?.toISOString(),
          }));
        } catch {
          // findSyncStates may not be available
        }

        sendResponse({
          type: 'STORAGE_GET_INFO',
          success: true,
          data: {
            activeStore: activeStore
              ? {
                  storageIdentityKey: activeStore.storageIdentityKey,
                  storageName: activeStore.storageName,
                  endpointURL: activeStore.endpointURL,
                  isEnabled: activeStore.isEnabled,
                }
              : null,
            backupStores: backupStores.map((s) => ({
              storageIdentityKey: s.storageIdentityKey,
              storageName: s.storageName,
              endpointURL: s.endpointURL,
            })),
            storageIdentityKey: settings.storageIdentityKey,
            remoteUrl: remoteStorage?.endpointUrl,
            outputCount,
            transactionCount,
            syncStates,
            storageConfig,
          },
        });
      } catch (error) {
        sendResponse({
          type: 'STORAGE_GET_INFO',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  const processStorageSyncBackups = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet();
    } catch (err) {
      sendResponse({
        type: 'STORAGE_SYNC_BACKUPS',
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
    if (!accountContext) {
      sendResponse({ type: 'STORAGE_SYNC_BACKUPS', success: false, error: 'Wallet not initialized' });
      return;
    }
    accountContext.storage
      .updateBackups()
      .then((log) => {
        sendResponse({ type: 'STORAGE_SYNC_BACKUPS', success: true, data: { log } });
      })
      .catch((error: unknown) => {
        sendResponse({
          type: 'STORAGE_SYNC_BACKUPS',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  /**
   * Read the current account's storageConfig (or the implicit-default shape
   * for accounts that predate it), apply a patch, and persist the result
   * back to the same account.
   *
   * We resolve absent storageConfig into a concrete shape on first write so
   * that "remove api.1sat.app" after a "switch to local" on a legacy account
   * works — the URL gets captured into remotes[] as the implicit→explicit
   * materialization step.
   */
  const updateStorageConfig = async (patch: (current: StorageConfig) => StorageConfig): Promise<StorageConfig> => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account loaded');
    const identityAddress = account.addresses.identityAddress;
    const existing: StorageConfig = account.storageConfig ?? {
      activeRemote: DEFAULT_STORAGE_REMOTE,
      remotes: [DEFAULT_STORAGE_REMOTE],
    };
    const next = patch(existing);
    await chromeStorageService.updateNested('accounts', {
      [identityAddress]: { storageConfig: next } as unknown as Account,
    });
    return next;
  };

  const processStorageSetActiveStorage = async (target: 'local' | string, sendResponse: CallbackResponse) => {
    try {
      await ensureWallet();
    } catch (err) {
      sendResponse({
        type: 'STORAGE_SET_ACTIVE_STORAGE',
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
    if (!accountContext) {
      sendResponse({
        type: 'STORAGE_SET_ACTIVE_STORAGE',
        success: false,
        error: 'Wallet not initialized',
      });
      return;
    }
    try {
      await accountContext.setActiveStorage(target);
      const nextConfig = await updateStorageConfig((current) => {
        if (target === 'local') {
          return { activeRemote: undefined, remotes: current.remotes ?? [] };
        }
        // Ensure the URL is in the remotes list so it survives restart.
        const remotes = current.remotes ?? [];
        const withTarget = remotes.includes(target) ? remotes : [...remotes, target];
        return { activeRemote: target, remotes: withTarget };
      });
      sendResponse({
        type: 'STORAGE_SET_ACTIVE_STORAGE',
        success: true,
        data: { storageConfig: nextConfig },
      });
    } catch (error) {
      sendResponse({
        type: 'STORAGE_SET_ACTIVE_STORAGE',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const processStorageAddRemote = async (url: string, sendResponse: CallbackResponse) => {
    try {
      await ensureWallet();
    } catch (err) {
      sendResponse({
        type: 'STORAGE_ADD_REMOTE',
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
    if (!accountContext) {
      sendResponse({
        type: 'STORAGE_ADD_REMOTE',
        success: false,
        error: 'Wallet not initialized',
      });
      return;
    }
    try {
      await accountContext.addRemote(url);
      const nextConfig = await updateStorageConfig((current) => {
        const remotes = current.remotes ?? [];
        return {
          ...current,
          remotes: remotes.includes(url) ? remotes : [...remotes, url],
        };
      });
      sendResponse({
        type: 'STORAGE_ADD_REMOTE',
        success: true,
        data: { storageConfig: nextConfig },
      });
    } catch (error) {
      sendResponse({
        type: 'STORAGE_ADD_REMOTE',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Remove a remote from the configured list. Pure config persistence —
   * the SDK does not support detaching a live connection, so the removed
   * remote stays connected for this session and will simply not be
   * reconnected on next unlock. Refuses if the URL is the current active.
   */
  const processStorageRemoveRemote = async (url: string, sendResponse: CallbackResponse) => {
    if (!accountContext) {
      sendResponse({
        type: 'STORAGE_REMOVE_REMOTE',
        success: false,
        error: 'Wallet not initialized',
      });
      return;
    }
    try {
      const nextConfig = await updateStorageConfig((current) => {
        if (current.activeRemote === url) {
          throw new Error('Cannot remove the active remote — switch active to local or another remote first.');
        }
        const remotes = (current.remotes ?? []).filter((r) => r !== url);
        return { ...current, remotes };
      });
      sendResponse({
        type: 'STORAGE_REMOVE_REMOTE',
        success: true,
        data: { storageConfig: nextConfig },
      });
    } catch (error) {
      sendResponse({
        type: 'STORAGE_REMOVE_REMOTE',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // PERMISSIONS MANAGEMENT HANDLERS ********************************

  // biome-ignore lint/suspicious/noExplicitAny: WPM token shapes vary by type
  type PermissionToken = any & { type: string; originator: string };

  const processPermissionsListAll = async (sendResponse: CallbackResponse) => {
    try {
      const wpm = (await ensureWallet()) as LocalWalletPermissionsManager;

      const [protocols, baskets, spending, certificates] = await Promise.all([
        wpm.listProtocolPermissions({}),
        wpm.listBasketAccess({}),
        wpm.listSpendingAuthorizations({}),
        wpm.listCertificateAccess({}),
      ]);

      // Tag each token with its type, pass everything else through as-is
      const allTokens: PermissionToken[] = [
        ...protocols.map((t: PermissionToken) => ({ ...t, type: 'protocol' })),
        ...baskets.map((t: PermissionToken) => ({ ...t, type: 'basket' })),
        ...spending.map((t: PermissionToken) => ({ ...t, type: 'spending' })),
        ...certificates.map((t: PermissionToken) => ({ ...t, type: 'certificate' })),
      ];

      // Group by originator
      const groupMap = new Map<string, PermissionToken[]>();
      for (const token of allTokens) {
        const key = token.originator ?? token.rawOriginator ?? '';
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(token);
      }

      const groups = Array.from(groupMap.entries()).map(([originator, permissions]) => ({
        originator,
        permissions,
      }));

      sendResponse({ type: 'PERMISSIONS_LIST_ALL', success: true, data: { groups } });
    } catch (error) {
      console.error('[PERMISSIONS_LIST_ALL] Error:', error);
      sendResponse({
        type: 'PERMISSIONS_LIST_ALL',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const processPermissionsQuerySpent = async (message: { token: PermissionToken }, sendResponse: CallbackResponse) => {
    try {
      const wpm = (await ensureWallet()) as LocalWalletPermissionsManager;
      const satoshisSpent = await wpm.querySpentSince(message.token);
      sendResponse({ type: 'PERMISSIONS_QUERY_SPENT', success: true, data: { satoshisSpent } });
    } catch (error) {
      console.error('[PERMISSIONS_QUERY_SPENT] Error:', error);
      sendResponse({
        type: 'PERMISSIONS_QUERY_SPENT',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const processPermissionsRevokeOne = async (message: { token: PermissionToken }, sendResponse: CallbackResponse) => {
    try {
      const wpm = (await ensureWallet()) as LocalWalletPermissionsManager;
      await wpm.revokePermission(message.token);
      sendResponse({ type: 'PERMISSIONS_REVOKE_ONE', success: true });
    } catch (error) {
      console.error('[PERMISSIONS_REVOKE_ONE] Error:', error);
      sendResponse({
        type: 'PERMISSIONS_REVOKE_ONE',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const processPermissionsRevokeAll = async (message: { originator: string }, sendResponse: CallbackResponse) => {
    try {
      const wpm = (await ensureWallet()) as LocalWalletPermissionsManager;
      const revoked = await wpm.revokeAllForOriginator(message.originator);
      sendResponse({ type: 'PERMISSIONS_REVOKE_ALL', success: true, data: { revokedCount: revoked.length } });
    } catch (error) {
      console.error('[PERMISSIONS_REVOKE_ALL] Error:', error);
      sendResponse({
        type: 'PERMISSIONS_REVOKE_ALL',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

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

  const processGetBalanceRequest = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet();
    } catch (err) {
      sendResponse({
        type: YoursEventName.GET_BALANCE,
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
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
    // Wait for startup initialization to complete before checking accountContext
    startupInitPromise.then(() => {
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
    });
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
      // Service worker may have slept — ensure the wallet is (re)initialized before
      // accessing accountContext. ensureWallet() silently re-initializes if the wallet
      // is unlocked, or launches the unlock popup if it isn't.
      try {
        await ensureWallet();
      } catch (err) {
        sendResponse({
          type: 'MASTER_BACKUP',
          success: false,
          error: err instanceof Error ? err.message : 'Wallet not available',
        });
        return;
      }

      if (!accountContext) {
        sendResponse({
          type: 'MASTER_BACKUP',
          success: false,
          error: 'Wallet not initialized',
        });
        return;
      }

      const chain = 'main' as const;
      const { account } = chromeStorageService.getCurrentAccountObject();
      const identityKey = account?.pubKeys?.identityPubKey || '';

      // Use the WalletStorageManager directly from AccountContext.
      // Cast through `unknown` because WalletBackupService imports its WalletStorageManager
      // type from `@bsv/wallet-toolbox-mobile` while AccountContext uses `@bsv/wallet-toolbox`.
      // They're the same shape at runtime but TypeScript sees two distinct types.
      const storage = accountContext.storage as unknown as Parameters<typeof WalletBackupService.exportToFile>[0];
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
        chain,
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

      // Manifest travels in `data` since ResponseEventDetail only defines {type, success, data, error}.
      sendResponse({
        type: 'MASTER_RESTORE',
        success: true,
        data: manifest,
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
      currentTime - Number(lastActiveTime) < getInactivityLimit() &&
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

    const respond = (success: boolean, error?: string) => {
      sendResponse({
        type: CWIEventName.WAIT_FOR_AUTHENTICATION,
        success,
        data: success ? { authenticated: true } : undefined,
        error,
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
          respond(
            decision === 'approved',
            decision !== 'approved' ? 'User declined the connection request' : undefined,
          );
        };
      },
      () => {
        respond(true);
        // Close the unlock popup — connect approval not needed
        if (popupWindowId) {
          removeWindow(popupWindowId);
          popupWindowId = undefined;
          chrome.storage.local.remove('popupWindowId');
        }
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
      console.log(
        '[background] processCWIGetPublicKey: entering, params:',
        JSON.stringify(message.params),
        'originator:',
        message.originator,
      );
      const w = await ensureWallet();
      console.log('[background] processCWIGetPublicKey: ensureWallet resolved, calling w.getPublicKey...');
      const result = await w.getPublicKey(message.params, message.originator);
      console.log('[background] processCWIGetPublicKey: getPublicKey returned successfully');
      sendResponse({
        type: CWIEventName.GET_PUBLIC_KEY,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[background] processCWIGetPublicKey: error:', error);
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
      console.log('[background] processCWIVerifySignature: entering, originator:', message.originator);
      const w = await ensureWallet();
      console.log('[background] processCWIVerifySignature: ensureWallet resolved, calling w.verifySignature...');
      const result = await w.verifySignature(message.params, message.originator);
      console.log('[background] processCWIVerifySignature: success');
      sendResponse({
        type: CWIEventName.VERIFY_SIGNATURE,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[background] processCWIVerifySignature: error:', error);
      sendResponse({
        type: CWIEventName.VERIFY_SIGNATURE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWICreateHmac = async (
    message: { params: CreateHmacArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    console.log(
      '[background] processCWICreateHmac called, originator:',
      message.originator,
      'params:',
      JSON.stringify(message.params),
    );
    try {
      const w = await ensureWallet();
      console.log('[background] processCWICreateHmac: wallet obtained, calling w.createHmac...');
      const result = await w.createHmac(message.params, message.originator);
      console.log('[background] processCWICreateHmac: success');
      sendResponse({
        type: CWIEventName.CREATE_HMAC,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[background] processCWICreateHmac: error:', error);
      sendResponse({
        type: CWIEventName.CREATE_HMAC,
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
      console.log('[background] processCWIVerifyHmac: entering, originator:', message.originator);
      const w = await ensureWallet();
      console.log('[background] processCWIVerifyHmac: ensureWallet resolved, calling w.verifyHmac...');
      const result = await w.verifyHmac(message.params, message.originator);
      console.log('[background] processCWIVerifyHmac: success');
      sendResponse({
        type: CWIEventName.VERIFY_HMAC,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[background] processCWIVerifyHmac: error:', error);
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
      console.log('[background] processCWICreateSignature: entering, originator:', message.originator);
      const w = await ensureWallet();
      console.log('[background] processCWICreateSignature: ensureWallet resolved, calling w.createSignature...');
      const result = await w.createSignature(message.params, message.originator);
      console.log('[background] processCWICreateSignature: success');
      sendResponse({
        type: CWIEventName.CREATE_SIGNATURE,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[background] processCWICreateSignature: error:', error);
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
      console.log('[signAction] Success:', JSON.stringify(result, null, 2));
      sendResponse({
        type: CWIEventName.SIGN_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[signAction] Error:', error);
      if (error && typeof error === 'object') {
        const { sendWithResults, txid, code } = error as Record<string, unknown>;
        if (sendWithResults) {
          console.error('[signAction] sendWithResults:', JSON.stringify(sendWithResults, null, 2));
          console.error('[signAction] txid:', txid, 'code:', code);
        }
      }
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

  const processCWIInternalizeAction = async (
    message: { params: InternalizeActionArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.internalizeAction(message.params, message.originator);
      sendResponse({
        type: CWIEventName.INTERNALIZE_ACTION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.INTERNALIZE_ACTION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIRelinquishOutput = async (
    message: { params: RelinquishOutputArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.relinquishOutput(message.params, message.originator);
      sendResponse({
        type: CWIEventName.RELINQUISH_OUTPUT,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.RELINQUISH_OUTPUT,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIRevealCounterpartyKeyLinkage = async (
    message: { params: RevealCounterpartyKeyLinkageArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.revealCounterpartyKeyLinkage(message.params, message.originator);
      sendResponse({
        type: CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIRevealSpecificKeyLinkage = async (
    message: { params: RevealSpecificKeyLinkageArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.revealSpecificKeyLinkage(message.params, message.originator);
      sendResponse({
        type: CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIAcquireCertificate = async (
    message: { params: AcquireCertificateArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.acquireCertificate(message.params, message.originator);
      sendResponse({
        type: CWIEventName.ACQUIRE_CERTIFICATE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.ACQUIRE_CERTIFICATE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIListCertificates = async (
    message: { params: ListCertificatesArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.listCertificates(message.params, message.originator);
      sendResponse({
        type: CWIEventName.LIST_CERTIFICATES,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.LIST_CERTIFICATES,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIProveCertificate = async (
    message: { params: ProveCertificateArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.proveCertificate(message.params, message.originator);
      sendResponse({
        type: CWIEventName.PROVE_CERTIFICATE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.PROVE_CERTIFICATE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIRelinquishCertificate = async (
    message: { params: RelinquishCertificateArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.relinquishCertificate(message.params, message.originator);
      sendResponse({
        type: CWIEventName.RELINQUISH_CERTIFICATE,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.RELINQUISH_CERTIFICATE,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIDiscoverByIdentityKey = async (
    message: { params: DiscoverByIdentityKeyArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.discoverByIdentityKey(message.params, message.originator);
      sendResponse({
        type: CWIEventName.DISCOVER_BY_IDENTITY_KEY,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.DISCOVER_BY_IDENTITY_KEY,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
    return true;
  };

  const processCWIDiscoverByAttributes = async (
    message: { params: DiscoverByAttributesArgs; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();
      const result = await w.discoverByAttributes(message.params, message.originator);
      sendResponse({
        type: CWIEventName.DISCOVER_BY_ATTRIBUTES,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.DISCOVER_BY_ATTRIBUTES,
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
      chromeStorageService.remove('connectRequest');
      chromeStorageService.getAndSetStorage().then((res) => {
        if (res?.popupWindowId) {
          removeWindow(res.popupWindowId);
          chromeStorageService.remove('popupWindowId');
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
