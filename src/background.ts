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
} from '@bsv/wallet-toolbox-client';
import type { LocalWalletPermissionsManager } from '@1sat/wallet-browser';
import { deriveDepositAddresses } from '@1sat/actions';
import { removeWindow } from './utils/chromeHelpers';
import { Account, ChromeStorageObject, StorageConfig } from './services/types/chromeStorage.types';
import { ChromeStorageService } from './services/ChromeStorage.service';
import {
  denyAllOneSatPrompts,
  getPendingOneSatPrompt,
  handleOneSatPermissionResponse,
  initOneSatPromptBridge,
} from './services/oneSatPrompt';
import type { PromptKind } from './promptProtocol';
import { initWallet, openAccountStorageForBackup, type AccountContext } from './initWallet';
import { HOSTED_YOURS_IMAGE } from './utils/constants';
import { WalletBackupService } from './backup/WalletBackupService';
import { repairStaleAccounts, usbRekey, type UsbRekeyRequest } from './services/usbRekeyBackground';
import { USB_HANDLE_DB_NAME } from './services/UsbKey.service';

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

// Drop live context immediately; destroy in background (never block lock on hung close).
const dropWalletContext = (reason: string) => {
  const ctx = accountContext;
  accountContext = null;
  if (!ctx) return;
  console.log(`[background] dropWalletContext (${reason}): gone immediately`);
  void ctx.close().catch((err) => console.error(`[background] close after ${reason}:`, err));
};

// Initialize wallet on startup (will be null if locked)
/**
 * The initialization currently in flight, whoever started it (startup, unlock,
 * account switch, restore). ensureWallet() waits on it so popup calls that arrive
 * while the wallet is being built are queued instead of failing with
 * "Wallet not available" — which left the first MNEE lookup after an unlock at zero.
 */
let initInFlight: Promise<WalletInterface | null> | null = null;

const initializeWallet = (): Promise<WalletInterface | null> => {
  const run = runInitializeWallet();
  initInFlight = run;
  return run.finally(() => {
    if (initInFlight === run) initInFlight = null;
  });
};

const runInitializeWallet = async (): Promise<WalletInterface | null> => {
  console.log('[background] initializeWallet: starting, current accountContext:', !!accountContext);
  if (accountContext) {
    dropWalletContext('before-init');
  }
  // USB key security: finish any re-key whose read-back never ran, so no
  // account is left under a previous epoch's key.
  try {
    await repairStaleAccounts(chromeStorageService);
  } catch (err) {
    console.error('[background] repairStaleAccounts failed:', err);
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

// --- USB unlock keeper (offscreen document) ---------------------------------
// Chrome keeps a File System Access grant only while an extension page is
// open. The invisible offscreen page keeps one open for the whole browser
// session whenever USB unlock is on, so the grant obtained once in the
// standalone window survives and the popup can read the drive afterwards. It
// also probes the drive on a timer and reports presence here.
const USB_KEEPER_URL = 'offscreen.html';
const USB_REMOVAL_GRACE_MS = 5000;
let usbRemovalTimer: ReturnType<typeof setTimeout> | undefined;
let lastUsbState: 'present' | 'absent' | 'permission' | 'off' | undefined;
const USB_KEY_ABSENT_MESSAGE = 'Insert your USB key to continue';

/** dApp calls that spend, sign, or reveal. Refused with a clear error when the key is out. */
const USB_GATED_CWI_ACTIONS = new Set<string>([
  CWIEventName.CREATE_ACTION,
  CWIEventName.SIGN_ACTION,
  CWIEventName.INTERNALIZE_ACTION,
  CWIEventName.CREATE_SIGNATURE,
  CWIEventName.CREATE_HMAC,
  CWIEventName.ENCRYPT,
  CWIEventName.DECRYPT,
  CWIEventName.RELINQUISH_OUTPUT,
  CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE,
  CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE,
  CWIEventName.ACQUIRE_CERTIFICATE,
  CWIEventName.PROVE_CERTIFICATE,
  CWIEventName.RELINQUISH_CERTIFICATE,
]);

/**
 * While unlocked, the keeper's last report is authoritative: 'absent' and
 * 'permission' both mean the drive is not readable right now. Unknown (keeper
 * not yet reported) never blocks.
 */
const usbKeyMissing = (): boolean =>
  !!chromeStorageService.getUsbSecurity()?.enabled && (lastUsbState === 'absent' || lastUsbState === 'permission');

const hasUsbKeeper = async (): Promise<boolean> => {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
};

const ensureUsbKeeper = async (): Promise<void> => {
  const enabled = !!chromeStorageService.getUsbSecurity()?.enabled;
  const exists = await hasUsbKeeper();
  try {
    if (enabled && !exists) {
      await chrome.offscreen.createDocument({
        url: USB_KEEPER_URL,
        reasons: [chrome.offscreen.Reason.LOCAL_STORAGE],
        justification: 'Keeps access to the registered USB drive alive and checks that it is still inserted.',
      });
    } else if (!enabled && exists) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    console.warn('[background] USB keeper:', err instanceof Error ? err.message : err);
  }
};

const onUsbPresence = (state: 'present' | 'absent' | 'permission' | 'off') => {
  lastUsbState = state;
  if ((state === 'absent' || state === 'permission') && accountContext) {
    if (usbRemovalTimer) return;
    usbRemovalTimer = setTimeout(async () => {
      usbRemovalTimer = undefined;
      if (!accountContext) return;
      console.log('[background] USB key removed — locking');
      dropWalletContext('usb-removed');
      await chromeStorageService.clearPassKey();
      await chromeStorageService.update({ isLocked: true });
    }, USB_REMOVAL_GRACE_MS);
    return;
  }
  // present, permission (unknown), or off: cancel any pending lock.
  if (usbRemovalTimer) {
    clearTimeout(usbRemovalTimer);
    usbRemovalTimer = undefined;
  }
};

// Start initialization — clean up stale popup windows then initialize wallet.
// ensureWallet() awaits this so CWI messages don't launch popups during init.
const startupInitPromise = chromeStorageService
  .getAndSetStorage()
  .then(async () => {
    // Close any orphaned extension popup windows from a previous session/reload.
    // The USB key window is a user-driven multi-step flow, not a prompt: the
    // worker idles out and restarts while the user reads or writes a recovery
    // code, and closing it here would abort enrolment mid-way.
    const extOrigin = chrome.runtime.getURL('');
    const usbUrl = chrome.runtime.getURL('usb.html');
    const allWindows = await chrome.windows.getAll({ populate: true });
    for (const w of allWindows) {
      if (w.tabs?.some((t) => t.url?.startsWith(usbUrl))) continue;
      if (w.type === 'popup' && w.id && w.tabs?.some((t) => t.url?.startsWith(extOrigin))) {
        try {
          await chrome.windows.remove(w.id);
        } catch {
          // Window already gone
        }
      }
    }
    await chrome.storage.local.remove('popupWindowId');

    // One-time migration: prompts now live in memory + prompt.html windows,
    // so drop request entries persisted by older versions.
    await chrome.storage.local.remove([
      'permissionRequest',
      'groupedPermissionRequest',
      'counterpartyPermissionRequest',
      'oneSatPermissionRequest',
      'transactionApprovalRequest',
      'sendMNEERequest',
    ]);

    // Only initialize wallet if it's within the active session window.
    // If locked (inactive or manual lock), keys stay encrypted until the user unlocks.
    await chromeStorageService.getAndSetStorage();
    await ensureUsbKeeper();
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

  // If wallet is currently initializing (startup, unlock, account switch, restore),
  // wait for that instead of rejecting or launching a popup.
  const inFlight = reinitPromise ?? initInFlight;
  if (inFlight) {
    const wallet = await inFlight.catch(() => null);
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
      showUnlockUi();
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

// In-flight dApp CWI requests that may have opened (or reused) the floating popup.
let inFlightDappRequests = 0;

// Window ids the background closed itself. windows.onRemoved treats any other
// close of the prompt window as the user dismissing it and denies every pending
// prompt; a background-initiated close already checked that nothing was pending.
const selfClosedWindowIds = new Set<number>();

const hasQueuedDappUi = (): boolean =>
  pendingPermissionRequests.size > 0 ||
  pendingGroupedPermissionRequests.size > 0 ||
  pendingCounterpartyPermissionRequests.size > 0 ||
  getPendingOneSatPrompt() !== undefined;

const closeDappPopup = (): void => {
  if (!popupWindowId) return;
  selfClosedWindowIds.add(popupWindowId);
  removeWindow(popupWindowId);
  popupWindowId = undefined;
  chrome.storage.local.remove('popupWindowId');
};

/**
 * Close the floating dApp popup when no permission/approval UI is queued.
 * Ignores in-flight CWI work so unlock and permission screens dismiss as
 * soon as their UI is done; a later prompt reopens via showPromptUi.
 * Never touches the browser-action popup (activePopupPorts).
 */
const closeDappPopupIfNoUi = (): void => {
  if (!popupWindowId) return;
  if (pendingWalletWaiters.length > 0) return;
  if (hasQueuedDappUi()) return;
  closeDappPopup();
};

/**
 * Close the floating dApp popup only when fully idle: no queued UI, no
 * unlock waiters, and no in-flight dApp CWI requests.
 */
const closeDappPopupIfIdle = (): void => {
  if (!popupWindowId) return;
  if (inFlightDappRequests > 0) return;
  if (pendingWalletWaiters.length > 0) return;
  if (hasQueuedDappUi()) return;
  closeDappPopup();
};

/** Look up a queued prompt payload for the prompt window by kind/requestID. */
const getPendingPromptPayload = (kind: string, requestID?: string): unknown => {
  switch (kind) {
    case 'permission':
      return requestID ? pendingPermissionRequests.get(requestID)?.request : undefined;
    case 'groupedPermission':
      return requestID ? pendingGroupedPermissionRequests.get(requestID)?.request : undefined;
    case 'counterpartyPermission':
      return requestID ? pendingCounterpartyPermissionRequests.get(requestID)?.request : undefined;
    case 'oneSatPermission':
      return getPendingOneSatPrompt(requestID);
    default:
      return undefined;
  }
};

/** The oldest queued prompt, if any, for the prompt window to render next. */
const getNextPendingPrompt = (): { kind: PromptKind; requestID: string } | undefined => {
  const permission = pendingPermissionRequests.keys().next();
  if (!permission.done) return { kind: 'permission', requestID: permission.value };
  const grouped = pendingGroupedPermissionRequests.keys().next();
  if (!grouped.done) return { kind: 'groupedPermission', requestID: grouped.value };
  const counterparty = pendingCounterpartyPermissionRequests.keys().next();
  if (!counterparty.done) return { kind: 'counterpartyPermission', requestID: counterparty.value };
  return getPendingOneSatPrompt()
    ? { kind: 'oneSatPermission', requestID: getPendingOneSatPrompt()!.requestID }
    : undefined;
};

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
    console.log('[background] Inactivity detected — wallet gone, clearing passKey');
    dropWalletContext('inactivity');
    await chromeStorageService.clearPassKey();
    await chromeStorageService.update({ isLocked: true });
  }
});

// Forward declarations for the prompt-window launchers (defined inside the
// isInServiceWorker block below).
let showPromptUi: (kind: PromptKind, requestID?: string) => void = () => {
  console.warn('showPromptUi called before initialization');
};
let showUnlockUi: () => void = () => {
  console.warn('showUnlockUi called before initialization');
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
    showPromptUi('permission', request.requestID);
  });
};

const showGroupedPermissionPrompt = (request: GroupedPermissionRequest): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingGroupedPermissionRequests.set(request.requestID, { request, resolve, reject });
    showPromptUi('groupedPermission', request.requestID);
  });
};

const showCounterpartyPermissionPrompt = (request: CounterpartyPermissionRequest): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingCounterpartyPermissionRequests.set(request.requestID, { request, resolve, reject });
    showPromptUi('counterpartyPermission', request.requestID);
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
    dropWalletContext('signOut');
    await chromeStorageService.clearPassKey();
    await deleteAllIDBDatabases();
  };

  const switchAccount = async () => {
    console.log('[background] switchAccount: starting');
    const doSwitch = async () => {
      try {
        dropWalletContext('switchAccount');
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

  const createNewPopup = (kind?: PromptKind, requestID?: string) => {
    console.log('[background] createNewPopup called', kind, requestID);
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (requestID) params.set('requestID', requestID);
    const query = params.toString();
    chrome.windows.create(
      {
        url: chrome.runtime.getURL('prompt.html') + (query ? `?${query}` : ''),
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

  const notifyPromptWindow = (kind: PromptKind, requestID?: string) => {
    chrome.runtime.sendMessage({ action: 'SHOW_PROMPT', kind, requestID }).catch(() => {
      // No listener (window still booting); it reads its URL params on mount
    });
  };

  showPromptUi = (kind, requestID) => {
    console.log('[background] showPromptUi called', kind, requestID);

    // Check if any popup window with our extension URL is already open
    chrome.windows.getAll({ populate: true }, (windows) => {
      const promptUrl = chrome.runtime.getURL('prompt.html');
      const existingPopup = windows.find(
        (w) => w.type === 'popup' && w.tabs?.some((tab) => tab.url?.startsWith(promptUrl)),
      );

      if (existingPopup) {
        // Focus existing popup and push the new prompt into it
        chrome.windows.update(existingPopup.id!, { focused: true });
        popupWindowId = existingPopup.id;
        notifyPromptWindow(kind, requestID);
        return;
      }

      // Fast path: module-level variable still has the popup ID
      if (popupWindowId) {
        chrome.windows
          .update(popupWindowId, { focused: true })
          .then(() => notifyPromptWindow(kind, requestID))
          .catch(() => {
            popupWindowId = undefined;
            createNewPopup(kind, requestID);
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
              notifyPromptWindow(kind, requestID);
            })
            .catch(() => {
              chrome.storage.local.remove('popupWindowId');
              createNewPopup(kind, requestID);
            });
        } else {
          createNewPopup(kind, requestID);
        }
      });
    });
  };

  showUnlockUi = () => {
    // The browser-action popup renders its own unlock UI; never force a
    // window over it just to unlock.
    if (activePopupPorts.size > 0) {
      console.log('[background] showUnlockUi: extension popup is connected, skipping window creation');
      return;
    }
    showPromptUi('unlock');
  };

  // Wire the 1Sat permission module's prompt bridge into the prompt flow.
  // Done once during background init so showOneSatPrompt has a working
  // bridge before initWallet (called on unlock) registers the module.
  initOneSatPromptBridge({
    showPrompt: (requestID) => showPromptUi('oneSatPermission', requestID),
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
      // Prompt window flow queries
      'GET_PROMPT_PAYLOAD',
      'GET_NEXT_PROMPT',
      'CLOSE_PROMPT_WINDOW',
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
      // USB key security (popup / USB window internal)
      'USB_REKEY',
      'USB_PING',
      'USB_PRESENCE',
      'USB_GET_CONFIG',
      // Storage management (popup internal)
      'STORAGE_GET_INFO',
      'STORAGE_SYNC_BACKUPS',
      'STORAGE_REPAIR_SYNC',
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
        // Prompt window payload/flow queries
        case 'GET_PROMPT_PAYLOAD': {
          const { kind, requestID } = message as { kind: string; requestID?: string };
          const payload = getPendingPromptPayload(kind, requestID);
          console.log('[background] GET_PROMPT_PAYLOAD', kind, requestID, 'found:', !!payload);
          sendResponse({ type: 'GET_PROMPT_PAYLOAD', success: !!payload, data: payload });
          return true;
        }
        case 'GET_NEXT_PROMPT': {
          sendResponse({
            type: 'GET_NEXT_PROMPT',
            success: true,
            data: { prompt: getNextPendingPrompt(), busy: inFlightDappRequests > 0 },
          });
          return true;
        }
        // The prompt window never closes itself. It asks here, and the background
        // closes it only if nothing is pending at that instant; otherwise it hands
        // back the next prompt to render. This removes the race where a prompt
        // queued between "nothing pending" and the actual close was denied as a
        // user dismissal by windows.onRemoved.
        case 'CLOSE_PROMPT_WINDOW': {
          const next = getNextPendingPrompt();
          if (next) {
            sendResponse({ type: 'CLOSE_PROMPT_WINDOW', success: false, data: { prompt: next } });
            return true;
          }
          if (pendingWalletWaiters.length > 0) {
            sendResponse({ type: 'CLOSE_PROMPT_WINDOW', success: false, data: { prompt: { kind: 'unlock' } } });
            return true;
          }
          const windowId = popupWindowId ?? sender.tab?.windowId;
          if (windowId !== undefined) {
            selfClosedWindowIds.add(windowId);
            removeWindow(windowId);
            if (windowId === popupWindowId) {
              popupWindowId = undefined;
              chrome.storage.local.remove('popupWindowId');
            }
          }
          sendResponse({ type: 'CLOSE_PROMPT_WINDOW', success: true });
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
          // Gone immediately so lock never waits on hung AuthFetch/storage close.
          dropWalletContext('WALLET_LOCKED');
          chromeStorageService.clearPassKey().catch(() => {});
          sendResponse({ type: 'WALLET_LOCKED', success: true });
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

                // Resolve any CWI handlers waiting for the wallet
                if (wallet && pendingWalletWaiters.length > 0) {
                  for (const waiter of pendingWalletWaiters.splice(0)) {
                    waiter.resolve(wallet);
                  }
                }
                // Close the unlock popup only once fully idle: in-flight dApp
                // calls resumed by this unlock may still raise an approval
                // screen in this window; silent calls close it via their
                // completion hook moments later. Deferred so the resumed
                // handlers (microtasks behind the waiters above) can register
                // as in-flight before the idle check runs; a synchronous check
                // always saw zero and closed the window under the next prompt.
                setTimeout(closeDappPopupIfIdle, 50);
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
          processMasterBackup(message.password, sendResponse);
          return true;
        case 'USB_PING':
          // Keeps the worker from idling out while the USB window is open.
          sendResponse({ type: 'USB_PING', success: true });
          return true;
        case 'USB_GET_CONFIG':
          // The offscreen keeper has no chrome.storage; it asks for the settings.
          chromeStorageService
            .getAndSetStorage()
            .then(() =>
              sendResponse({ type: 'USB_GET_CONFIG', success: true, data: chromeStorageService.getUsbSecurity() }),
            )
            .catch((err: Error) => sendResponse({ type: 'USB_GET_CONFIG', success: false, error: err.message }));
          return true;
        case 'USB_PRESENCE':
          onUsbPresence(message.state);
          sendResponse({ type: 'USB_PRESENCE', success: true });
          return true;
        case 'USB_REKEY':
          usbRekey(chromeStorageService, message as UsbRekeyRequest)
            .then(async (res) => {
              await ensureUsbKeeper();
              sendResponse({ type: 'USB_REKEY', ...res });
            })
            .catch((err: Error) => sendResponse({ type: 'USB_REKEY', success: false, error: err.message }));
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
        case 'STORAGE_REPAIR_SYNC':
          processStorageRepairSync(sendResponse);
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
                { wallet: accountContext.baseWallet, chain: 'main', isBaseWallet: true },
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

    // Track dApp CWI work so the floating popup closes when the request is
    // done and no approval UI remains. Extension-internal callers skip this —
    // they use suppressPopup and must not own popupWindowId lifecycle.
    const runDappRequest = (work: Promise<unknown>) => {
      if (isFromExtension) {
        void work;
        return;
      }
      inFlightDappRequests++;
      void Promise.resolve(work)
        .catch(() => {})
        .finally(() => {
          inFlightDappRequests--;
          void closeDappPopupIfIdle();
        });
    };

    // USB unlock: a spend/sign from a dApp while the key is out gets a clear
    // refusal instead of a permission prompt that can never be satisfied.
    if (USB_GATED_CWI_ACTIONS.has(message.action) && accountContext && usbKeyMissing()) {
      sendResponse({ type: message.action, success: false, error: USB_KEY_ABSENT_MESSAGE });
      return true;
    }

    ensureWallet(isFromExtension)
      .then(() => {
        console.log('[background] ensureWallet resolved for action:', message.action);
        switch (message.action) {
          // CWI (BRC-100) handlers - direct passthrough to wallet
          // WalletPermissionsManager handles permission prompts internally
          case CWIEventName.WAIT_FOR_AUTHENTICATION:
            runDappRequest(processCWIWaitForAuthentication(message, sendResponse));
            return true;
          case CWIEventName.LIST_OUTPUTS:
            runDappRequest(processCWIListOutputs(message, sendResponse));
            return true;
          case CWIEventName.GET_NETWORK:
            runDappRequest(processCWIGetNetwork(message, sendResponse));
            return true;
          case CWIEventName.GET_HEIGHT:
            runDappRequest(processCWIGetHeight(message, sendResponse));
            return true;
          case CWIEventName.GET_HEADER_FOR_HEIGHT:
            runDappRequest(processCWIGetHeaderForHeight(message, sendResponse));
            return true;
          case CWIEventName.GET_PUBLIC_KEY:
            runDappRequest(processCWIGetPublicKey(message, sendResponse));
            return true;
          case CWIEventName.LIST_ACTIONS:
            runDappRequest(processCWIListActions(message, sendResponse));
            return true;
          case CWIEventName.VERIFY_SIGNATURE:
            runDappRequest(processCWIVerifySignature(message, sendResponse));
            return true;
          case CWIEventName.VERIFY_HMAC:
            runDappRequest(processCWIVerifyHmac(message, sendResponse));
            return true;
          case CWIEventName.CREATE_HMAC:
            runDappRequest(processCWICreateHmac(message, sendResponse));
            return true;
          case CWIEventName.CREATE_SIGNATURE:
            runDappRequest(processCWICreateSignature(message, sendResponse));
            return true;
          case CWIEventName.ENCRYPT:
            runDappRequest(processCWIEncrypt(message, sendResponse));
            return true;
          case CWIEventName.DECRYPT:
            runDappRequest(processCWIDecrypt(message, sendResponse));
            return true;
          case CWIEventName.CREATE_ACTION:
            runDappRequest(processCWICreateAction(message, sendResponse));
            return true;
          case CWIEventName.SIGN_ACTION:
            runDappRequest(processCWISignAction(message, sendResponse));
            return true;
          case CWIEventName.ABORT_ACTION:
            runDappRequest(processCWIAbortAction(message, sendResponse));
            return true;
          case CWIEventName.INTERNALIZE_ACTION:
            runDappRequest(processCWIInternalizeAction(message, sendResponse));
            return true;
          case CWIEventName.RELINQUISH_OUTPUT:
            runDappRequest(processCWIRelinquishOutput(message, sendResponse));
            return true;
          case CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE:
            runDappRequest(processCWIRevealCounterpartyKeyLinkage(message, sendResponse));
            return true;
          case CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE:
            runDappRequest(processCWIRevealSpecificKeyLinkage(message, sendResponse));
            return true;
          case CWIEventName.ACQUIRE_CERTIFICATE:
            runDappRequest(processCWIAcquireCertificate(message, sendResponse));
            return true;
          case CWIEventName.LIST_CERTIFICATES:
            runDappRequest(processCWIListCertificates(message, sendResponse));
            return true;
          case CWIEventName.PROVE_CERTIFICATE:
            runDappRequest(processCWIProveCertificate(message, sendResponse));
            return true;
          case CWIEventName.RELINQUISH_CERTIFICATE:
            runDappRequest(processCWIRelinquishCertificate(message, sendResponse));
            return true;
          case CWIEventName.DISCOVER_BY_IDENTITY_KEY:
            runDappRequest(processCWIDiscoverByIdentityKey(message, sendResponse));
            return true;
          case CWIEventName.DISCOVER_BY_ATTRIBUTES:
            runDappRequest(processCWIDiscoverByAttributes(message, sendResponse));
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
        if (!isFromExtension) void closeDappPopupIfIdle();
      });

    return true;
  });

  // STORAGE MANAGEMENT HANDLERS ********************************

  const processStorageGetInfo = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet(true);
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
      await ensureWallet(true);
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
   * Repair local/remote divergence (e.g. v6 flipped remote-active without a full push).
   * setActive(local) then setActive(remote) — merge both ways via toolbox, end remote-active.
   */
  const processStorageRepairSync = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet(true);
    } catch (err) {
      sendResponse({
        type: 'STORAGE_REPAIR_SYNC',
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
    if (!accountContext) {
      sendResponse({ type: 'STORAGE_REPAIR_SYNC', success: false, error: 'Wallet not initialized' });
      return;
    }

    try {
      const { account } = chromeStorageService.getCurrentAccountObject();
      const config: StorageConfig = account?.storageConfig ?? { remotes: [] };
      const remoteUrl = config.activeRemote || config.remotes?.[0];
      if (!remoteUrl) {
        sendResponse({
          type: 'STORAGE_REPAIR_SYNC',
          success: false,
          error: 'No remote configured to repair',
        });
        return;
      }

      await accountContext.setActiveStorage('local');
      await accountContext.setActiveStorage(remoteUrl);

      const nextConfig = await updateStorageConfig((current) => {
        const remotes = current.remotes ?? [];
        const withTarget = remotes.includes(remoteUrl) ? remotes : [...remotes, remoteUrl];
        return { ...current, activeRemote: remoteUrl, remotes: withTarget };
      });

      sendResponse({
        type: 'STORAGE_REPAIR_SYNC',
        success: true,
        data: { storageConfig: nextConfig },
      });
    } catch (error) {
      sendResponse({
        type: 'STORAGE_REPAIR_SYNC',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
      await ensureWallet(true);
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
      await ensureWallet(true);
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
      const wpm = (await ensureWallet(true)) as LocalWalletPermissionsManager;

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
      const wpm = (await ensureWallet(true)) as LocalWalletPermissionsManager;
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
      const wpm = (await ensureWallet(true)) as LocalWalletPermissionsManager;
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
      const wpm = (await ensureWallet(true)) as LocalWalletPermissionsManager;
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

    closeDappPopupIfNoUi();
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

    closeDappPopupIfNoUi();
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

    closeDappPopupIfNoUi();
    return true;
  };

  // YOURS-SPECIFIC HANDLERS ********************************

  const processGetBalanceRequest = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet(true);
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

  const processGetReceiveAddressRequest = async (sendResponse: CallbackResponse) => {
    try {
      await ensureWallet(true);
    } catch (err) {
      sendResponse({
        type: YoursEventName.GET_RECEIVE_ADDRESS,
        success: false,
        error: err instanceof Error ? err.message : 'Wallet not available',
      });
      return;
    }
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

  const processMasterBackup = async (password: string | undefined, sendResponse: CallbackResponse) => {
    // Remember where the user started so we can restore even if export fails.
    const originalSelectedAccount = chromeStorageService.getCurrentAccountObject().selectedAccount || '';

    const broadcastProgress = (event: {
      message: string;
      stage?: string;
      accountName?: string;
      accountIndex?: number;
      totalAccounts?: number;
    }) => {
      console.log('[MasterBackup]', event.message);
      chrome.runtime
        .sendMessage({
          action: 'MASTER_BACKUP_PROGRESS',
          data: event,
        })
        .catch(() => {
          // Popup may not be listening — that's fine
        });
    };

    /** Awaitable close — dropWalletContext is fire-and-forget and races IDB. */
    const closeLiveWallet = async (reason: string) => {
      const ctx = accountContext;
      accountContext = null;
      if (!ctx) return;
      console.log(`[MasterBackup] closing live wallet (${reason})`);
      try {
        await ctx.close();
      } catch (err) {
        console.error(`[MasterBackup] close after ${reason}:`, err);
      }
    };

    const restoreOriginalAccount = async () => {
      try {
        if (originalSelectedAccount) {
          await chromeStorageService.update({ selectedAccount: originalSelectedAccount });
        }
        await chromeStorageService.getAndSetStorage();
        // Full init so the user lands back on a normal live wallet.
        await initializeWallet();
      } catch (err) {
        console.error('[MasterBackup] failed to restore original account:', err);
      }
    };

    try {
      // Extension-internal: fail closed if locked (no unlock popup).
      try {
        await ensureWallet(true);
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

      // Same order as Settings backup overlay (getAllAccounts).
      const accountsList = chromeStorageService
        .getAllAccounts()
        .map((acct) => {
          const withAddress = acct as Account & { address?: string };
          const identityAddress = withAddress.address || acct.addresses?.identityAddress || '';
          return {
            identityKey: acct.pubKeys?.identityPubKey || '',
            identityAddress,
            name: acct.name || identityAddress.slice(0, 8),
          };
        })
        .filter((a) => a.identityKey && a.identityAddress);

      if (accountsList.length === 0) {
        sendResponse({ type: 'MASTER_BACKUP', success: false, error: 'No accounts found to back up' });
        return;
      }

      // Release the live wallet so per-account opens own the IDB connection.
      await closeLiveWallet('before-master-backup');

      const blob = await WalletBackupService.exportAllAccounts(
        chromeStorageService,
        chain,
        accountsList,
        async (acct) => {
          // Do NOT use chromeStorageService.switchAccount — that emits SWITCH_ACCOUNT
          // and would race a full initializeWallet while we hold a backup session.
          await chromeStorageService.update({ selectedAccount: acct.identityAddress });
          await chromeStorageService.getAndSetStorage();
          const opened = await openAccountStorageForBackup(chromeStorageService);
          // wallet-browser vs wallet-toolbox-client WalletStorageManager types differ at compile time only.
          return {
            storage: opened.storage as unknown as import('@bsv/wallet-toolbox-client').WalletStorageManager,
            close: opened.close,
          };
        },
        password,
        broadcastProgress,
      );

      // Convert blob to base64 for message passing
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      await restoreOriginalAccount();

      sendResponse({
        type: 'MASTER_BACKUP',
        success: true,
        data: base64Data,
      });
    } catch (error) {
      console.error('[MasterBackup] Error:', error);
      broadcastProgress({
        stage: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      await restoreOriginalAccount();
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

      await chromeStorageService.getAndSetStorage();
      if (chromeStorageService.getUsbSecurity()?.enabled) {
        throw new Error('Turn off USB key security before restoring a backup');
      }
      // Any handles from a previous enrolment on this profile are meaningless for restored keys.
      indexedDB.deleteDatabase(USB_HANDLE_DB_NAME);

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

      const adminOriginator = `chrome-extension://${chrome.runtime.id}`;
      const isAdmin = message.originator === adminOriginator;
      const usesSendAllSentinel = message.params.outputs?.some((o) => o.satoshis === 2099999999999999) === true;
      const signer = isAdmin && usesSendAllSentinel && accountContext?.baseWallet ? accountContext.baseWallet : w;

      const result = await signer.createAction(message.params, message.originator);
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

    if (selfClosedWindowIds.delete(closedWindowId)) {
      // Background closed it after checking nothing was pending. If a prompt was
      // queued in the meantime, it was sent to a dying window: reopen for it.
      if (closedWindowId === popupWindowId) {
        popupWindowId = undefined;
        chromeStorageService.remove('popupWindowId');
      }
      const next = getNextPendingPrompt();
      if (next) showPromptUi(next.kind, next.requestID);
      else if (pendingWalletWaiters.length > 0) showUnlockUi();
      return;
    }

    if (closedWindowId === popupWindowId) {
      // Deny any pending permission requests when popup is closed
      for (const [requestID, pending] of pendingPermissionRequests) {
        accountContext?.wallet.denyPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingPermissionRequests.clear();

      for (const [requestID, pending] of pendingGroupedPermissionRequests) {
        accountContext?.wallet.denyGroupedPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingGroupedPermissionRequests.clear();

      for (const [requestID, pending] of pendingCounterpartyPermissionRequests) {
        accountContext?.wallet.denyCounterpartyPermission(requestID).catch(console.error);
        pending.reject(new Error('User dismissed the request'));
      }
      pendingCounterpartyPermissionRequests.clear();

      denyAllOneSatPrompts();

      // Reject any CWI handlers waiting for wallet unlock
      for (const waiter of pendingWalletWaiters.splice(0)) {
        waiter.reject(new Error('User dismissed the unlock request'));
      }

      popupWindowId = undefined;
      chromeStorageService.remove('popupWindowId');
    }
  });
}
