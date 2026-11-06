/**
 * Swap calls from the popup. The background owns the exchange client and runs
 * each swap to completion (see swapBackground.ts); these helpers ask it for
 * quotes, start jobs and follow their progress.
 */
import { sendMessageAsync } from '../utils/chromeHelpers';
import {
  SWAP_ACTIONS,
  SWAP_PROGRESS_EVENT,
  type SwapJob,
  type SwapListedToken,
  type SwapQuote,
  type SwapQuoteRequest,
  type SwapTokenStatus,
} from './swapTypes';

type Reply<T> = { success: true; data: T } | { success: false; error?: string };

const call = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const r = await sendMessageAsync<Reply<T>>(payload);
  if (!r) throw new Error('No answer from the wallet');
  if (!r.success) throw new Error(r.error ?? 'Swap request failed');
  return r.data;
};

export const swapQuote = (request: SwapQuoteRequest) => call<SwapQuote>({ action: SWAP_ACTIONS.QUOTE, request });
export const swapStart = (request: SwapQuoteRequest) => call<SwapJob>({ action: SWAP_ACTIONS.START, request });
export const swapStatus = (jobId: string) => call<SwapJob | null>({ action: SWAP_ACTIONS.STATUS, jobId });
export const swapJobs = () => call<SwapJob[]>({ action: SWAP_ACTIONS.LIST_JOBS });
export const swapCancel = (jobId: string) => call<boolean>({ action: SWAP_ACTIONS.CANCEL, jobId });
export const swapTokenStatus = (tokenId: string) =>
  call<SwapTokenStatus>({ action: SWAP_ACTIONS.TOKEN_STATUS, tokenId });
export const swapListedTokens = () => call<SwapListedToken[]>({ action: SWAP_ACTIONS.LISTED_TOKENS });
export const swapEnableToken = (tokenId: string) => call<boolean>({ action: SWAP_ACTIONS.ENABLE_TOKEN, tokenId });
export const swapMoveBack = (tokenId: string) =>
  call<{ txid: string; amount: string }>({ action: SWAP_ACTIONS.MOVE_BACK, tokenId });
export const swapMoveBackSats = () => call<{ txid: string; amount: string }>({ action: SWAP_ACTIONS.MOVE_BACK_SATS });

/** Follow every job the background reports; returns the unsubscribe. */
export const onSwapProgress = (cb: (job: SwapJob) => void): (() => void) => {
  const listener = (message: { action?: string; data?: SwapJob }) => {
    if (message?.action === SWAP_PROGRESS_EVENT && message.data) cb(message.data);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
};
