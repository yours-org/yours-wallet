/**
 * 1Sat permission module prompt bridge.
 *
 * The `@1sat/permission-module` calls back to the wallet via a
 * `promptHandler: (request) => Promise<boolean>` whenever it needs the
 * user to approve or reject an operation. We adapt that callback into the
 * extension's existing popup flow — store the request in chrome storage
 * so the popup React app can render `OneSatPermissionPrompt`, then resolve
 * the promise when the popup posts back via runtime messaging.
 *
 * Background-script-side state is kept in a module-level Map keyed by
 * a fresh requestID per call. The popup calls back into background via
 * `chrome.runtime.sendMessage({ action: 'oneSatPermissionResponse', ... })`,
 * and `handleOneSatPermissionResponse` resolves / rejects the matching
 * promise.
 */

import type { PromptRequest } from '@1sat/permission-module';
import type { ChromeStorageService } from './ChromeStorage.service';

export interface OneSatPromptStorageEntry {
  requestID: string;
  request: PromptRequest;
}

interface PendingEntry {
  resolve: (approved: boolean) => void;
  reject: (err: unknown) => void;
}

const pending = new Map<string, PendingEntry>();

let depsResolved = false;
let chromeStorageRef: ChromeStorageService | null = null;
let launchPopUpRef: () => void = () => {};
let getPopupWindowIdRef: () => number | undefined = () => undefined;

/**
 * Wire the prompt bridge to the extension's chrome storage service and
 * popup launcher. Must be called from background once during init.
 */
export const initOneSatPromptBridge = (deps: {
  chromeStorage: ChromeStorageService;
  launchPopUp: () => void;
  getPopupWindowId: () => number | undefined;
}): void => {
  chromeStorageRef = deps.chromeStorage;
  launchPopUpRef = deps.launchPopUp;
  getPopupWindowIdRef = deps.getPopupWindowId;
  depsResolved = true;
};

/**
 * Promise-returning prompt handler passed to `createOneSatPermissionModule`.
 *
 * The popup is responsible for clearing the storage entry after rendering
 * so subsequent prompts don't reuse stale state.
 */
export const showOneSatPrompt = async (
  request: PromptRequest,
): Promise<boolean> => {
  if (!depsResolved || !chromeStorageRef) {
    console.warn('[oneSatPrompt] bridge not initialized; auto-rejecting');
    return false;
  }

  const requestID = generateRequestID();

  return new Promise<boolean>((resolve, reject) => {
    pending.set(requestID, { resolve, reject });

    const entry: OneSatPromptStorageEntry = { requestID, request };
    chromeStorageRef!
      .update({ oneSatPermissionRequest: entry })
      .then(() => {
        const popupId = getPopupWindowIdRef();
        if (popupId !== undefined) {
          chrome.windows
            .update(popupId, { focused: true })
            .catch(() => launchPopUpRef());
        } else {
          launchPopUpRef();
        }
      })
      .catch((err) => {
        pending.delete(requestID);
        reject(err);
      });
  });
};

/**
 * Resolve a pending 1Sat prompt from the popup's runtime message.
 * Returns true if a matching request was found.
 *
 * Always clears the storage entry so the popup doesn't re-render a stale
 * request next time it opens — even if no matching `pending` entry was
 * found (e.g. service worker restarted and lost its in-memory state
 * after the prompt was queued).
 */
export const handleOneSatPermissionResponse = (
  requestID: string,
  approved: boolean,
): boolean => {
  // chromeStorage.update() does a deepMerge — setting `undefined` does NOT
  // remove the key. We must call chrome.storage.local.remove directly.
  chrome.storage.local.remove('oneSatPermissionRequest').catch(() => {});

  const entry = pending.get(requestID);
  if (!entry) return false;
  pending.delete(requestID);
  entry.resolve(approved);
  return true;
};

const generateRequestID = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
