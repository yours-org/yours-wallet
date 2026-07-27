/**
 * Holistic wallet lifecycle: either there is a live wallet, or there isn't.
 *
 * dropWallet → gone immediately (callers do not wait on destroy).
 * createWallet → only stand-up path; discards result if dropped mid-create.
 * Sync runs only while live (started on create).
 */
import type { WalletInterface } from '@bsv/sdk';
import type { ChromeStorageService } from './services/ChromeStorage.service';
import { initWallet, runWalletSync, type AccountContext, type InitWalletOptions } from './initWallet';

const GONE = 'Wallet not available';
const CLOSE_TIMEOUT_MS = 8_000;

let live: AccountContext | null = null;
/** Bumped on every drop — in-flight create must not publish if epoch changed. */
let epoch = 0;
/** Background close of last dropped instance. */
let closing: Promise<void> = Promise.resolve();
/** In-flight createWallet work — ensureWallet awaits this instead of treating gap as locked. */
let creating: Promise<AccountContext | null> | null = null;

export const getLiveContext = (): AccountContext | null => (live?.alive ? live : null);

export const getLiveWallet = (): WalletInterface | null => getLiveContext()?.wallet ?? null;

/** Current create in flight, if any. */
export const getCreating = (): Promise<AccountContext | null> | null => creating;

export const requireLiveContext = (): AccountContext => {
  const ctx = getLiveContext();
  if (!ctx) throw new Error(GONE);
  return ctx;
};

const closeQuietly = async (ctx: AccountContext, reason: string): Promise<void> => {
  const t0 = Date.now();
  try {
    await Promise.race([
      ctx.close(),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`close timed out after ${CLOSE_TIMEOUT_MS}ms`)), CLOSE_TIMEOUT_MS);
      }),
    ]);
    console.log(`[lifecycle] close done (${reason}) ${Date.now() - t0}ms`);
  } catch (error) {
    console.warn(`[lifecycle] close ended (${reason}) ${Date.now() - t0}ms:`, error);
  }
};

/**
 * Wallet is gone immediately. Returns right away — does not wait for destroy.
 * In-flight create is invalidated (epoch).
 */
export const dropWallet = (reason: string): Promise<void> => {
  epoch += 1;
  const ctx = live;
  live = null;
  if (!ctx) {
    console.log(`[lifecycle] drop (${reason}): already gone`);
    return Promise.resolve();
  }
  ctx.alive = false;
  console.log(`[lifecycle] drop (${reason}): gone immediately`);
  // Destroy in background; never block lock/API on hung AuthFetch/storage.
  const prior = closing;
  closing = (async () => {
    await prior.catch(() => undefined);
    await closeQuietly(ctx, reason);
  })();
  return Promise.resolve();
};

export type CreateWalletDeps = {
  chromeStorageService: ChromeStorageService;
  options?: InitWalletOptions;
  onReady?: (ctx: AccountContext) => void | Promise<void>;
};

/**
 * Only path that stands up a wallet.
 * Waits briefly for prior background close, then creates; discards if dropped mid-init.
 * Publishes `creating` for the whole run so ensureWallet can await the gap after drop.
 */
export const createWallet = async (deps: CreateWalletDeps): Promise<AccountContext | null> => {
  const run = (async (): Promise<AccountContext | null> => {
    await dropWallet('before-create');
    // Best-effort: don't stack two storage sessions if prior close can finish quickly.
    await Promise.race([closing, new Promise<void>((r) => setTimeout(r, CLOSE_TIMEOUT_MS))]);

    const myEpoch = epoch;
    console.log('[lifecycle] create: initWallet…');
    const t0 = Date.now();

    let ctx: AccountContext;
    try {
      ctx = await initWallet(deps.chromeStorageService, deps.options);
    } catch (error) {
      console.error('[lifecycle] create failed:', error);
      throw error;
    }

    if (myEpoch !== epoch) {
      console.log('[lifecycle] create: dropped during init — discarding');
      ctx.alive = false;
      void closeQuietly(ctx, 'discard-stale-create');
      return null;
    }

    ctx.alive = true;
    live = ctx;
    console.log(`[lifecycle] create: live ${Date.now() - t0}ms`);

    if (deps.onReady) {
      try {
        if (live === ctx && ctx.alive) await deps.onReady(ctx);
      } catch (error) {
        console.error('[lifecycle] onReady error:', error);
      }
    }

    return getLiveContext() === ctx ? ctx : null;
  })();

  creating = run;
  try {
    return await run;
  } finally {
    if (creating === run) creating = null;
  }
};

/** Sync only while live (lifecycle activity of a present wallet). */
export const syncIfLive = (reason: string): void => {
  const ctx = getLiveContext();
  if (ctx) void runWalletSync(ctx, reason);
};
