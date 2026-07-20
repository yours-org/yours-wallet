/* global chrome */
import { RequestParams, ResponseEventDetail, YoursEventName } from './inject';
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
import { deriveDepositAddresses } from '@1sat/actions';
import { removeWindow } from './utils/chromeHelpers';
import { Account, ChromeStorageObject, StorageConfig } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { handleOneSatPermissionResponse, initOneSatPromptBridge } from './services/oneSatPrompt';
import { initWallet, type AccountContext } from './initWallet';
import { HOSTED_YOURS_IMAGE } from './utils/constants';
import { WalletBackupService } from './backup/WalletBackupService';

let chromeStorageService = new ChromeStorageService();
const isInServiceWorker = self?.document === undefined;

// Account context - null if locked or not initialized
let accountContext: AccountContext | null = null;
// Set while wallet is reinitializing (e.g. account switch) to prevent
// ensureWallet from launching a popup during the transition.
let reinitPromise: Promise<WalletInterface | null> | null = null;
// Tracks active extension popup connections via chrome.runtime.onConnect.
// When the browser-action popup opens, it connects with name 'extension-popup'.
// When it closes, the port disconnects automatically. No timers needed.
const activePopupPorts = new Set<chrome.runtime.Port>();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'extension-popup') {
    activePopupPorts.add(port);
    port.onDisconnect.addListener(() => {
      activePopupPorts.delete(port);
    });
  }
});

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

    // Check for pending restore data for the CURRENT account (Phase 2 of two-phase restore).
    // Each account's data is stored separately — syncFromReader only accepts the
    // authenticated account's identityKey. Other accounts' data stays in IndexedDB
    // until they are switched to and initializeWallet runs again.
    const { account: currentAccount } = chromeStorageService.getCurrentAccountObject();
    const currentIdentityKey = currentAccount?.pubKeys?.identityPubKey || '';
    if (currentIdentityKey) {
      const hasPending = await WalletBackupService.hasPendingRestore(currentIdentityKey);
      console.log(
        '[background] initializeWallet: hasPendingRestore for',
        currentIdentityKey.slice(0, 8) + '...:',
        hasPending,
      );
      if (hasPending) {
        console.log('[background] initializeWallet: Found pending restore data, importing...');
        try {
          const storage = accountContext.storage as unknown as Parameters<
            typeof WalletBackupService.importPendingWalletData
          >[0];
          if (storage) {
            await WalletBackupService.importPendingWalletData(storage, currentIdentityKey, (event) => {
              console.log('[background] PendingRestore:', event.message);
            });
            console.log('[background] initializeWallet: Pending restore complete');
          }
        } catch (error) {
          console.error('[background] initializeWallet: Pending restore failed:', error);
          // Clear only this account's pending data to avoid repeated failures
          await WalletBackupService.clearAllPendingRestores();
        }
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
    const { account, lastActiveTime } = chromeStorageService.getCurrentAccountObject();
    const passKey = await chromeStorageService.getPassKey();
    const isUnlocked =
      passKey && account?.encryptedKeys && lastActiveTime && Date.now() - Number(lastActiveTime) < getInactivityLimit();

    if (isUnlocked) {
      try {
        await initializeWallet();
      } catch (error) {
        console.error('[background] Failed to initialize wallet on startup — locking:', error);
        await chromeStorageService.clearPassKey();
        await chromeStorageService.update({ isLocked: true, lastActiveTime: 0 });
      }
    } else if (account?.encryptedKeys) {
      // Wallet exists but can't initialize (no passKey or timed out) — ensure locked state
      await chromeStorageService.clearPassKey();
      await chromeStorageService.update({ isLocked: true, lastActiveTime: 0 });
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
const ensureWallet = async (suppressPopup = false): Promise<WalletInterface> => {
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
  // (unless suppressed, e.g. when called from the extension popup itself)
  if (suppressPopup) {
    return Promise.reject(new Error('Wallet not available'));
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
    await chromeStorageService.clearPassKey();
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
        return (accountContext as AccountContext | null)?.wallet ?? null;
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

    // If the extension's browser-action popup is currently open, don't create a window
    if (activePopupPorts.size > 0) {
      console.log('[background] launchPopUp: extension popup is connected, skipping window creation');
      return;
    }

    // Check if any popup window with our extension URL is already open
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

  // Wire the 1Sat permission module's prompt bridge into the popup flow.
  // Done once during background init so showOneSatPrompt has a working
  // bridge before initWallet (called on unlock) registers the module.
  initOneSatPromptBridge({
    chromeStorage: chromeStorageService,
    launchPopUp: () => launchPopUp(),
    getPopupWindowId: () => popupWindowId,
  });

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

    // Cross-validate originator against sender.origin for external messages
    if (!isFromExtension && message.originator && sender.origin) {
      try {
        const senderHost = new URL(sender.origin).host;
        if (message.originator !== senderHost) {
          sendResponse({ type: message.action, success: false, error: 'Origin mismatch' });
          return true;
        }
      } catch {
        sendResponse({ type: message.action, success: false, error: 'Invalid origin' });
        return true;
      }
    }

    // Actions that don't require authorization
    const noAuthRequired = [
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
      'ONE_SAT_PERMISSION_RESPONSE',
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
      // Address management (popup internal)
      'GET_DEPOSIT_ADDRESSES',
      'GENERATE_NEW_ADDRESS',
    ];

    if (noAuthRequired.includes(message.action)) {
      // IS_AUTHENTICATED and GET_VERSION are read-only discovery endpoints safe for any caller.
      // Everything else is an internal popup→background message that requires the sender
      // to be the extension itself (not a web page proxied through the content script).
      const openToAll = [CWIEventName.IS_AUTHENTICATED, CWIEventName.GET_VERSION];
      if (!openToAll.includes(message.action) && !isFromExtension) {
        sendResponse({ type: message.action, success: false, error: 'Unauthorized' });
        return true;
      }

      switch (message.action) {
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
          return processCWIIsAuthenticated(sendResponse);
        // CWI discovery - substrate detection ping, no wallet needed
        case CWIEventName.GET_VERSION:
          sendResponse({
            type: CWIEventName.GET_VERSION,
            success: true,
            data: { version: `yours-wallet-${chrome.runtime.getManifest().version}` },
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
        case 'ONE_SAT_PERMISSION_RESPONSE': {
          const { requestID, approved } = message as { requestID: string; approved: boolean };
          const handled = handleOneSatPermissionResponse(requestID, !!approved);
          sendResponse({ type: 'ONE_SAT_PERMISSION_RESPONSE', success: handled });
          return true;
        }
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
                // so requests resolved from the queue see the unlocked state.
                await chromeStorageService.update({ isLocked: false, lastActiveTime: Date.now() });

                sendResponse({ type: 'WALLET_UNLOCKED', success: !!wallet });

                const hadWaiters = pendingWalletWaiters.length > 0;
                // Resolve any CWI handlers waiting for the wallet
                if (wallet && hadWaiters) {
                  for (const waiter of pendingWalletWaiters.splice(0)) {
                    waiter.resolve(wallet);
                  }
                }
                // Don't close the popup if there's a pending permission request in
                // storage or if CWI handlers were waiting — the popup needs to
                // transition from the unlock screen to the permission screen.
                const storage = await chromeStorageService.getAndSetStorage();
                const hasPendingRequest =
                  hadWaiters ||
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
          processMasterRestore(message, sendResponse);
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
        case 'GET_DEPOSIT_ADDRESSES': {
          startupInitPromise.then(() => {
            if (!accountContext) {
              sendResponse({ type: 'GET_DEPOSIT_ADDRESSES', success: false, error: 'Wallet not initialized' });
              return;
            }
            const am = accountContext.syncContext.addressManager;
            const addresses = [];
            for (let i = 0; i <= am.getMaxKeyIndex(); i++) {
              const d = am.getAddressAtIndex(i);
              if (d) addresses.push(d);
            }
            sendResponse({ type: 'GET_DEPOSIT_ADDRESSES', success: true, data: addresses });
          });
          return true;
        }
        case 'GENERATE_NEW_ADDRESS': {
          if ((globalThis as any).__generatingAddress) {
            sendResponse({
              type: 'GENERATE_NEW_ADDRESS',
              success: false,
              error: 'Address generation already in progress',
            });
            return true;
          }
          (globalThis as any).__generatingAddress = true;
          startupInitPromise.then(async () => {
            try {
              if (!accountContext) {
                sendResponse({ type: 'GENERATE_NEW_ADDRESS', success: false, error: 'Wallet not initialized' });
                return;
              }
              const am = accountContext.syncContext.addressManager;
              const newIndex = am.getMaxKeyIndex() + 1;
              const { derivations } = await deriveDepositAddresses.execute(
                { wallet: accountContext.baseWallet, chain: 'main' },
                { startIndex: newIndex, count: 1 },
              );
              const newDerivation = derivations[0];

              // Persist BEFORE updating in-memory state so a crash can't lose the index
              const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
              if (account && selectedAccount) {
                const key: keyof ChromeStorageObject = 'accounts';
                await chromeStorageService.updateNested(key, {
                  [selectedAccount]: {
                    settings: { ...account.settings, maxKeyIndex: newIndex },
                  } as unknown as Account,
                });
              }

              am.addAddress(newDerivation);

              sendResponse({ type: 'GENERATE_NEW_ADDRESS', success: true, data: newDerivation });
            } catch (error) {
              sendResponse({
                type: 'GENERATE_NEW_ADDRESS',
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            } finally {
              (globalThis as any).__generatingAddress = false;
            }
          });
          return true;
        }
        default:
          break;
      }

      return;
    }

    // If message is from our own extension popup, check wallet state without launching popup.
    // The popup handles its own UI (unlock/create wallet pages).
    if (isFromExtension) {
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account?.encryptedKeys) {
        sendResponse({
          type: message.action,
          success: false,
          error: 'Wallet not available',
        });
        return true;
      }
      // Wallet credentials exist, continue to ensureWallet (which won't launch popup
      // because suppressPopup flag is set for this call).
    }

    ensureWallet(isFromExtension)
      .then(() => {
        console.log('[background] ensureWallet resolved for action:', message.action);
        switch (message.action) {
          // CWI (BRC-100) handlers - direct passthrough to wallet
          // WalletPermissionsManager handles permission prompts internally
          case CWIEventName.WAIT_FOR_AUTHENTICATION:
            processCWIWaitForAuthentication(message, sendResponse);
            return true;
          case CWIEventName.LIST_OUTPUTS:
            processCWIListOutputs(message, sendResponse);
            return true;
          case CWIEventName.GET_NETWORK:
            processCWIGetNetwork(message, sendResponse);
            return true;
          case CWIEventName.GET_HEIGHT:
            processCWIGetHeight(message, sendResponse);
            return true;
          case CWIEventName.GET_HEADER_FOR_HEIGHT:
            processCWIGetHeaderForHeight(message, sendResponse);
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
          remotes: [],
        };

        let outputCount = 0;
        let transactionCount = 0;
        try {
          const userId = await storage.getUserId();
          outputCount = await storage.runAsStorageProvider(async (sp) => sp.countOutputs({ partial: { userId } }));
          transactionCount = await storage.runAsStorageProvider(async (sp) =>
            sp.countTransactions({ partial: { userId } }),
          );
        } catch {
          // Counts may not be available during initialization
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

  /** Patch and persist the current account's storageConfig. */
  const updateStorageConfig = async (patch: (current: StorageConfig) => StorageConfig): Promise<StorageConfig> => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account loaded');
    const identityAddress = account.addresses.identityAddress;
    const existing: StorageConfig = account.storageConfig ?? { remotes: [] };
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
          return { ...current, activeRemote: undefined, remotes: current.remotes ?? [] };
        }
        const remotes = current.remotes ?? [];
        const withTarget = remotes.includes(target) ? remotes : [...remotes, target];
        return { ...current, activeRemote: target, remotes: withTarget };
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
    try {
      const nextConfig = await updateStorageConfig((current) => {
        if (current.activeRemote === url) {
          throw new Error('Cannot remove the active remote — switch active to local or another remote first.');
        }
        return {
          ...current,
          remotes: (current.remotes ?? []).filter((r) => r !== url),
        };
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
        // Prefer the user's selected primaryAddress from storage; fall back to index 0.
        const { account } = chromeStorageService.getCurrentAccountObject();
        const address = account?.primaryAddress ?? accountContext.syncContext.addressManager.getPrimaryAddress();
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

      // Build list of ALL accounts from chrome storage
      const chromeStorage = await chromeStorageService.getAndSetStorage();
      const allAccounts = chromeStorage?.accounts || {};
      const accountsList = Object.entries(allAccounts)
        .map(([identityAddress, acct]) => ({
          identityKey: acct.pubKeys?.identityPubKey || '',
          identityAddress,
          name: acct.name || identityAddress.slice(0, 8),
        }))
        .filter((a) => a.identityKey); // skip accounts with no identity key

      if (accountsList.length === 0) {
        sendResponse({ type: 'MASTER_BACKUP', success: false, error: 'No accounts found to back up' });
        return;
      }

      // Use the WalletStorageManager directly from AccountContext.
      // Cast through `unknown` because WalletBackupService imports its WalletStorageManager
      // type from `@bsv/wallet-toolbox-mobile` while AccountContext uses `@bsv/wallet-toolbox`.
      // They're the same shape at runtime but TypeScript sees two distinct types.
      const storage = accountContext.storage as unknown as Parameters<typeof WalletBackupService.exportAllAccounts>[0];
      if (!storage) {
        sendResponse({
          type: 'MASTER_BACKUP',
          success: false,
          error: 'Storage manager not available',
        });
        return;
      }

      const blob = await WalletBackupService.exportAllAccounts(
        storage,
        chromeStorageService,
        chain,
        accountsList,
        (event) => {
          console.log('[MasterBackup]', event.message);
          // Broadcast progress to popup so the UI can show per-account status
          chrome.runtime
            .sendMessage({
              action: 'MASTER_BACKUP_PROGRESS',
              data: event,
            })
            .catch(() => {
              // Popup may not be listening — that's fine
            });
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
      chrome.runtime
        .sendMessage({
          action: 'MASTER_BACKUP_PROGRESS',
          data: { stage: 'error', message: error instanceof Error ? error.message : String(error) },
        })
        .catch(() => {});
      sendResponse({
        type: 'MASTER_BACKUP',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** Decode a base64 string to Uint8Array. Returns the narrow `ArrayBuffer`-backed
   *  variant (not `ArrayBufferLike`) so the result is assignable to fflate's
   *  `Unzipped` type when fed into `FileRestoreReader` downstream. */
  const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  /**
   * Process a master restore request.
   *
   * The popup decompresses the ZIP (where Web Workers are available) and sends
   * only the extracted entries the background needs. The background never
   * touches the raw ZIP — no sync decompression in the service worker.
   */
  const processMasterRestore = async (
    message: {
      legacy: boolean;
      password: string;
      chromeStorageData: string;
      manifestData?: string;
      settingsData?: string;
      chunksData?: Record<string, string>;
    },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const { legacy, password, chromeStorageData } = message;

      // Decode the pre-extracted entries from the popup
      const chromeStorageBytes = fromBase64(chromeStorageData);
      const manifestBytes = message.manifestData ? fromBase64(message.manifestData) : undefined;
      const settingsBytes = message.settingsData ? fromBase64(message.settingsData) : undefined;

      // Decode chunk entries back to Uint8Arrays
      let chunks: Record<string, Uint8Array<ArrayBuffer>> | undefined;
      if (message.chunksData) {
        chunks = {};
        for (const [key, b64] of Object.entries(message.chunksData)) {
          chunks[key] = fromBase64(b64);
        }
      }

      console.log('[MasterRestore] Restoring from backup...', legacy ? '(legacy)' : '(v1/v2)');

      const manifest = await WalletBackupService.restoreFromExtractedData(
        chromeStorageService,
        {
          chromeStorage: chromeStorageBytes,
          manifest: manifestBytes,
          settings: settingsBytes,
          chunks,
          isLegacy: legacy,
        },
        password,
        (event) => {
          console.log('[MasterRestore]', event.message);
        },
      );

      // Refresh chrome storage service to pick up restored data (including passKey)
      await chromeStorageService.getAndSetStorage();
      console.log('[MasterRestore] Chrome storage refreshed');

      // Initialize the wallet so it's ready when the popup reloads.
      // For v1/v2 this also triggers Phase 2 import of pending wallet data.
      // For legacy this creates a fresh wallet-toolbox storage that syncs from remote.
      console.log('[MasterRestore] Initializing wallet...');
      const wallet = await initializeWallet();
      console.log('[MasterRestore] Wallet initialized:', !!wallet);

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
  // All handlers are direct passthroughs - WalletPermissionsManager handles permission prompts

  // Reports the user's authentication status (wallet set up and unlocked).
  // Per BRC-100 this is user-to-wallet status, independent of the calling
  // origin — site-level trust is handled by the permissions manager.
  const checkIsAuthenticated = async (): Promise<boolean> => {
    await chromeStorageService.getAndSetStorage();
    const result = chromeStorageService.getCurrentAccountObject();
    if (!result?.account) return false;

    const currentTime = Date.now();
    const lastActiveTime = result.lastActiveTime;

    return !result.isLocked && currentTime - Number(lastActiveTime) < getInactivityLimit();
  };

  const processCWIIsAuthenticated = (sendResponse: CallbackResponse) => {
    checkIsAuthenticated()
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

  const processCWIWaitForAuthentication = async (
    message: { params: RequestParams; originator?: string },
    sendResponse: CallbackResponse,
  ) => {
    try {
      const w = await ensureWallet();

      // The permissions manager handles the grouped-permission flow: it
      // fetches the originator's manifest.json and prompts once for any
      // declared permissions before resolving.
      const result = await w.waitForAuthentication({}, message.originator);
      sendResponse({
        type: CWIEventName.WAIT_FOR_AUTHENTICATION,
        success: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        type: CWIEventName.WAIT_FOR_AUTHENTICATION,
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
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

  const processCWIGetNetwork = async (message: { originator?: string }, sendResponse: CallbackResponse) => {
    try {
      const w = await ensureWallet();

      const result = await w.getNetwork({}, message.originator);
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

  const processCWIGetHeight = async (message: { originator?: string }, sendResponse: CallbackResponse) => {
    try {
      const w = await ensureWallet();

      const result = await w.getHeight({}, message.originator);
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
      console.log('[signAction] Success', result?.txid ? `txid=${result.txid}` : '');
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

  // HANDLE WINDOW CLOSE *****************************************
  chrome.windows.onRemoved.addListener((closedWindowId) => {
    console.log('Window closed: ', closedWindowId);

    if (closedWindowId === popupWindowId) {
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
