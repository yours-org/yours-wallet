/**
 * The swap executor, run by the background service worker on the exchange
 * client (`@dcasegr/amm-client`). A swap stages funds, relays through pools one
 * after another and lands the result; it must outlive the popup, so the popup
 * only starts jobs here and watches them.
 *
 * The client is handed in lazily: it needs the live wallet, which the
 * background rebuilds on unlock and account switch. Everything crossing to the
 * popup is the wire shape in swapTypes.ts (strings for bigints).
 */
import { errorKind } from '@dcasegr/amm-client';
import type {
  SwapCandle,
  SwapCandleTf,
  SwapJob,
  SwapLeg,
  SwapListedToken,
  SwapQuote,
  SwapQuoteRequest,
  SwapResult,
  SwapTokenStatus,
} from './swapTypes';

// The client's own types, narrowed to what the executor touches so a test can fake it.
type Bigintish = bigint;
type ClientLeg = { poolOutpoint: string; poolId: string; amountIn: Bigintish; amountOut: Bigintish; txid: string };
type ClientResult = {
  status: 'filled' | 'partial' | 'failed';
  stop: SwapResult['stop'];
  legs: ClientLeg[];
  totalIn: Bigintish;
  totalOut: Bigintish;
  unfilled: Bigintish;
  returned?: { txid: string; tokens: Bigintish } | { error: string };
};
export type ClientProgress =
  | { phase: 'staging'; sats: Bigintish; tokens: Bigintish }
  | { phase: 'relaying' | 'repricing'; leg: string; amountIn: Bigintish; amountOut: Bigintish; filled: ClientLeg[] }
  | { phase: 'returning'; filled: ClientLeg[] }
  | { phase: 'done'; result: ClientResult }
  | { phase: 'failed'; result?: ClientResult; error?: Error };
type ClientQuote = {
  request: { tokenId: string; side: 'buy' | 'sell'; amountIn: Bigintish; maxSlippageBps: number; maxSources: number };
  legs: Array<{ fees: { lpBps: number; validatorBps: number; commissionBps: number } }>;
  amountOut: Bigintish;
  minAmountOut: Bigintish;
  effectivePrice: number;
  marginalPrice: number;
  impactBps: number;
  stage: { amount: Bigintish; feeSats: Bigintish };
  legMinerFeeSats: Bigintish;
};
type ClientPools = { pools: unknown[] };
type ClientHosted = {
  tokenId: string;
  sym: string;
  dec: number;
  icon?: string;
  marginalPrice: number | null;
  pools: number;
};

/** The slice of the exchange client the executor uses. */
export interface SwapClient {
  tokenPools: (tokenId: string) => Promise<ClientPools>;
  quoteSwap: (req: ClientQuote['request'], held: ClientPools | null, meta: { sym: string; dec: number }) => ClientQuote;
  executeSwap: (
    quote: ClientQuote,
    o?: { onProgress?: (p: ClientProgress) => void; signal?: AbortSignal },
  ) => Promise<ClientResult>;
  hostedTokens: () => Promise<ClientHosted[]>;
  enabledList: () => Promise<Array<{ tokenId: string; status: 'enabled' | 'disabled' }>>;
  tokensToEnable: () => Promise<Array<{ tokenId: string }>>;
  enableTokenPaid: (tokenId: string) => Promise<unknown>;
  defaults: () => Promise<{ enablePriceSats?: number }>;
  moveBackTokens: (tokenId: string) => Promise<{ txid: string; amount: Bigintish }>;
  moveBackStagedSats: () => Promise<{ txid: string; amount: Bigintish }>;
  /** The wallet's tokens as the exchange client sees them, with what sits in the swap basket. */
  myTokens: () => Promise<Array<{ tokenId: string; inSwaps: Bigintish }>>;
  /** Sats sitting in the swap basket. */
  swapBasketSats: () => Promise<number>;
  /** The exchange's price candles for a token, oldest first; prices as sats/tokens pairs in base units. */
  candles: (
    tokenId: string,
    o: { tf: SwapCandleTf; from: number; to: number; series?: 'fill' | 'market' },
  ) => Promise<Array<{ t: number; c: { sats: Bigintish; tokens: Bigintish } }>>;
}

export interface SwapServiceOptions {
  /** The client for the current wallet, or undefined when swaps are not available (no exchange on this chain, wallet locked). */
  client: () => SwapClient | undefined;
  /** Called after every change to a job, with its wire shape. */
  broadcast: (job: SwapJob) => void;
  now?: () => number;
  newId?: () => string;
}

const toLeg = (l: ClientLeg): SwapLeg => ({
  poolOutpoint: l.poolOutpoint,
  poolId: l.poolId,
  amountIn: l.amountIn.toString(),
  amountOut: l.amountOut.toString(),
  txid: l.txid,
});

const toResult = (r: ClientResult): SwapResult => ({
  status: r.status,
  stop: r.stop,
  legs: r.legs.map(toLeg),
  totalIn: r.totalIn.toString(),
  totalOut: r.totalOut.toString(),
  unfilled: r.unfilled.toString(),
  returned:
    r.returned === undefined
      ? undefined
      : 'txid' in r.returned
        ? { txid: r.returned.txid, tokens: r.returned.tokens.toString() }
        : { error: r.returned.error },
});

export const toWireQuote = (request: SwapQuoteRequest, q: ClientQuote): SwapQuote => ({
  request,
  amountIn: q.request.amountIn.toString(),
  amountOut: q.amountOut.toString(),
  minAmountOut: q.minAmountOut.toString(),
  effectivePrice: q.effectivePrice,
  marginalPrice: q.marginalPrice,
  impactBps: q.impactBps,
  legs: q.legs.length,
  fees: q.legs[0]?.fees ?? null,
  legMinerFeeSats: q.legMinerFeeSats.toString(),
  stageFeeSats: q.stage.feeSats.toString(),
});

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A sats/tokens price pair (base units) as sats per whole token; 0 when the pair has no tokens. */
export const satsPerWholeToken = (p: { sats: Bigintish; tokens: Bigintish }, dec: number): number => {
  const tokens = Number(p.tokens) / 10 ** dec;
  return tokens > 0 ? Number(p.sats) / tokens : 0;
};

/**
 * The client's minimum-size refusal ("No pool here takes a swap this small: at least 50000 sats.")
 * as the exchange's own app words it, with sats shown as BSV. Other messages pass through.
 */
export const quoteErrorText = (msg: string): string => {
  const m = /takes a swap this small: at least (\d+(?:\.\d+)?) (\S+?)\.?$/.exec(msg);
  if (!m) return msg;
  const [, amount, unit] = m;
  const shown =
    unit === 'sats'
      ? `${(Number(amount) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })} BSV`
      : `${amount} ${unit}`;
  return `Minimum ${shown} per trade, the smallest a pool accepts.`;
};

/** How long a finished job stays listable, so a popup reopened later still sees the outcome. */
export const SWAP_JOB_TTL_MS = 30 * 60 * 1000;

export const createSwapService = (opts: SwapServiceOptions) => {
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? (() => `swap-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const jobs = new Map<string, { job: SwapJob; abort: AbortController }>();

  const requireClient = (): SwapClient => {
    const c = opts.client();
    if (!c) throw new Error('Swaps are not available on this network');
    return c;
  };

  const clientRequest = (req: SwapQuoteRequest) => ({
    tokenId: req.token.tokenId,
    side: req.side,
    amountIn: BigInt(req.amountIn),
    maxSlippageBps: req.slippageBps,
    maxSources: Math.max(1, Math.floor(req.maxSources)),
  });

  /** A fresh quote against the pools as the exchange answers right now. */
  const quoteNow = async (req: SwapQuoteRequest) => {
    const client = requireClient();
    const held = await client.tokenPools(req.token.tokenId);
    let q: ClientQuote;
    try {
      q = client.quoteSwap(clientRequest(req), held, { sym: req.token.sym, dec: req.token.dec });
    } catch (e) {
      throw new Error(quoteErrorText(message(e)));
    }
    if (q.legs.length === 0) throw new Error('No pool can fill this swap within your slippage setting.');
    return { client, q };
  };

  const quote = async (req: SwapQuoteRequest): Promise<SwapQuote> => toWireQuote(req, (await quoteNow(req)).q);

  const update = (entry: { job: SwapJob }, patch: Partial<SwapJob>) => {
    entry.job = { ...entry.job, ...patch, updatedAt: now() };
    jobs.get(entry.job.id)!.job = entry.job;
    opts.broadcast(entry.job);
  };

  const sweepOld = () => {
    const cutoff = now() - SWAP_JOB_TTL_MS;
    for (const [id, e] of jobs) {
      if ((e.job.phase === 'done' || e.job.phase === 'failed') && e.job.updatedAt < cutoff) jobs.delete(id);
    }
  };

  /** Start a swap: requotes, then runs to completion in the background. Resolves with the job as queued. */
  const start = async (req: SwapQuoteRequest): Promise<SwapJob> => {
    sweepOld();
    const { client, q } = await quoteNow(req);
    const abort = new AbortController();
    const job: SwapJob = {
      id: newId(),
      quote: toWireQuote(req, q),
      phase: 'queued',
      startedAt: now(),
      updatedAt: now(),
      filled: [],
    };
    const entry: { job: SwapJob; abort: AbortController } = { job, abort };
    jobs.set(entry.job.id, entry);
    opts.broadcast(entry.job);

    const onProgress = (p: ClientProgress) => {
      switch (p.phase) {
        case 'staging':
          update(entry, { phase: 'staging', stagedSats: p.sats.toString(), stagedTokens: p.tokens.toString() });
          break;
        case 'relaying':
        case 'repricing':
          update(entry, { phase: p.phase, leg: p.leg, filled: p.filled.map(toLeg) });
          break;
        case 'returning':
          update(entry, { phase: 'returning', leg: undefined, filled: p.filled.map(toLeg) });
          break;
        case 'done':
          update(entry, {
            phase: 'done',
            leg: undefined,
            filled: p.result.legs.map(toLeg),
            result: toResult(p.result),
          });
          break;
        case 'failed':
          update(entry, {
            phase: 'failed',
            leg: undefined,
            filled: p.result ? p.result.legs.map(toLeg) : entry.job.filled,
            result: p.result ? toResult(p.result) : undefined,
            error: p.error ? message(p.error) : entry.job.error,
            errorKind: p.error ? errorKind(p.error) : entry.job.errorKind,
          });
          break;
      }
    };

    void (async () => {
      try {
        const r = await client.executeSwap(q, { onProgress, signal: abort.signal });
        // The client reports done/failed through onProgress; make sure the final state is recorded either way.
        if (entry.job.phase !== 'done' && entry.job.phase !== 'failed') {
          update(entry, {
            phase: r.status === 'failed' ? 'failed' : 'done',
            leg: undefined,
            filled: r.legs.map(toLeg),
            result: toResult(r),
          });
        }
      } catch (e) {
        const kind = errorKind(e);
        update(entry, { phase: 'failed', leg: undefined, error: message(e), errorKind: kind });
        // A swap that stops on its own moves its funds back itself; one that throws may leave
        // them staged, so recovery runs. A declined wallet prompt staged nothing.
        if (kind !== 'user_rejected') {
          try {
            await client.moveBackTokens(req.token.tokenId);
            update(entry, { recovered: true });
          } catch (err) {
            console.warn('[swap] move back after failure failed:', message(err));
          }
        }
      }
    })();

    return entry.job;
  };

  const get = (id: string): SwapJob | undefined => jobs.get(id)?.job;

  const list = (): SwapJob[] => {
    sweepOld();
    return [...jobs.values()].map((e) => e.job).sort((a, b) => b.startedAt - a.startedAt);
  };

  /** Stops before the next leg; what did not fill comes back. */
  const cancel = (id: string): boolean => {
    const e = jobs.get(id);
    if (!e) return false;
    e.abort.abort();
    return true;
  };

  const tokenStatus = async (tokenId: string): Promise<SwapTokenStatus> => {
    const client = opts.client();
    const none: SwapTokenStatus = {
      tokenId,
      available: false,
      listed: false,
      pools: 0,
      marginalPrice: null,
      canList: false,
      reservedTokens: '0',
      reservedSats: '0',
    };
    if (!client) return none;
    const [hosted, enabled, candidates, mine, basketSats] = await Promise.all([
      client.hostedTokens().catch(() => [] as ClientHosted[]),
      client.enabledList().catch(() => []),
      client.tokensToEnable().catch(() => []),
      client.myTokens().catch(() => []),
      client.swapBasketSats().catch(() => 0),
    ]);
    const h = hosted.find((t) => t.tokenId === tokenId);
    const listed = enabled.some((t) => t.tokenId === tokenId && t.status === 'enabled');
    const canList = !listed && candidates.some((c) => c.tokenId === tokenId);
    const listFeeSats = canList
      ? (await client.defaults().catch((): { enablePriceSats?: number } => ({}))).enablePriceSats
      : undefined;
    return {
      tokenId,
      available: true,
      listed: listed || !!h,
      pools: h?.pools ?? 0,
      marginalPrice: h?.marginalPrice ?? null,
      canList,
      listFeeSats,
      reservedTokens: (mine.find((t) => t.tokenId === tokenId)?.inSwaps ?? 0n).toString(),
      reservedSats: Math.max(0, Math.floor(basketSats)).toString(),
    };
  };

  const listedTokens = async (): Promise<SwapListedToken[]> => {
    const client = opts.client();
    if (!client) return [];
    const hosted = await client.hostedTokens();
    return hosted.map((t) => ({
      tokenId: t.tokenId,
      sym: t.sym,
      dec: t.dec,
      icon: t.icon,
      pools: t.pools,
      marginalPrice: t.marginalPrice,
    }));
  };

  const enableToken = async (tokenId: string): Promise<void> => {
    await requireClient().enableTokenPaid(tokenId);
  };

  const moveBack = async (tokenId: string): Promise<{ txid: string; amount: string }> => {
    const r = await requireClient().moveBackTokens(tokenId);
    return { txid: r.txid, amount: r.amount.toString() };
  };

  /** Close prices over a window, as sats per whole token (the `market` series: the mid, what the stats price is). */
  const candles = async (
    tokenId: string,
    dec: number,
    tf: SwapCandleTf,
    from: number,
    to: number,
  ): Promise<SwapCandle[]> => {
    const rows = await requireClient().candles(tokenId, { tf, from, to, series: 'market' });
    return rows
      .map((c) => ({ t: c.t, close: satsPerWholeToken(c.c, dec) }))
      .filter((c) => Number.isFinite(c.close) && c.close > 0);
  };

  /** Return the sats a swap staged and never spent (a swap the wallet stopped mid-way). */
  const moveBackSats = async (): Promise<{ txid: string; amount: string }> => {
    const r = await requireClient().moveBackStagedSats();
    return { txid: r.txid, amount: r.amount.toString() };
  };

  return { quote, start, get, list, cancel, tokenStatus, listedTokens, enableToken, moveBack, moveBackSats, candles };
};

export type SwapService = ReturnType<typeof createSwapService>;
