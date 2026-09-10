/**
 * 1Sat permission module prompt bridge.
 *
 * The `@1sat/permission-module` calls back to the wallet via a
 * `promptHandler: (request) => Promise<boolean>` whenever it needs the
 * user to approve or reject an operation. We adapt that callback into the
 * extension's prompt-window flow: the request is kept in an in-memory map
 * keyed by a fresh requestID, and the background opens (or reuses) a
 * `prompt.html` window that fetches the payload via runtime messaging and
 * posts the user's decision back with `ONE_SAT_PERMISSION_RESPONSE`.
 *
 * Nothing is persisted to chrome storage: if the service worker restarts,
 * the pending promise is gone anyway, so a stale prompt must never be
 * re-rendered.
 */

import type { PromptRequest } from '@1sat/permission-module';

export interface OneSatPromptStorageEntry {
  requestID: string;
  request: PromptRequest;
}

interface PendingEntry {
  request: PromptRequest;
  resolve: (approved: boolean) => void;
  reject: (err: unknown) => void;
}

const pending = new Map<string, PendingEntry>();

let bridgeReady = false;
let showPromptRef: (requestID: string) => void = () => {};

/**
 * Wire the prompt bridge to the extension's prompt-window launcher.
 * Must be called from background once during init.
 */
export const initOneSatPromptBridge = (deps: { showPrompt: (requestID: string) => void }): void => {
  showPromptRef = deps.showPrompt;
  bridgeReady = true;
};

/**
 * Promise-returning prompt handler passed to `createOneSatPermissionModule`.
 */
export const showOneSatPrompt = async (request: PromptRequest): Promise<boolean> => {
  if (!bridgeReady) {
    console.warn('[oneSatPrompt] bridge not initialized; auto-rejecting');
    return false;
  }

  const requestID = generateRequestID();

  return new Promise<boolean>((resolve, reject) => {
    pending.set(requestID, { request, resolve, reject });
    showPromptRef(requestID);
  });
};

/**
 * Resolve a pending 1Sat prompt from the prompt window's runtime message.
 * Returns true if a matching request was found.
 */
export const handleOneSatPermissionResponse = (requestID: string, approved: boolean): boolean => {
  const entry = pending.get(requestID);
  if (!entry) return false;
  pending.delete(requestID);
  entry.resolve(approved);
  return true;
};

/**
 * Look up a pending prompt by requestID, or the oldest pending prompt when
 * called without one.
 */
export const getPendingOneSatPrompt = (requestID?: string): OneSatPromptStorageEntry | undefined => {
  if (requestID) {
    const entry = pending.get(requestID);
    return entry ? { requestID, request: entry.request } : undefined;
  }
  const first = pending.entries().next();
  if (first.done) return undefined;
  const [id, entry] = first.value;
  return { requestID: id, request: entry.request };
};

/** Reject every pending prompt (e.g. user dismissed the prompt window). */
export const denyAllOneSatPrompts = (): void => {
  for (const entry of pending.values()) {
    entry.reject(new Error('User dismissed the request'));
  }
  pending.clear();
};

const generateRequestID = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
