/**
 * Swap wire types: what the popup and the background exchange about a swap.
 * The background runs the exchange client (`@dcasegr/amm-client`), so a swap
 * survives the popup closing; the popup only asks for quotes, starts jobs and
 * watches progress. Every amount crosses as a decimal string: chrome messages
 * cannot carry bigint.
 */

export type SwapSide = 'buy' | 'sell';

export type SwapTokenRef = {
  /** `<txid>_<vout>` */
  tokenId: string;
  sym: string;
  dec: number;
};

export type SwapQuoteRequest = {
  token: SwapTokenRef;
  side: SwapSide;
  /** Sats when buying, token units when selling. */
  amountIn: string;
  slippageBps: number;
  maxSources: number;
};

export type SwapFees = { lpBps: number; validatorBps: number; commissionBps: number };

export type SwapQuote = {
  request: SwapQuoteRequest;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  /** Average price of this quote, sats per whole token. */
  effectivePrice: number;
  /** The pool price before this swap, sats per whole token. */
  marginalPrice: number;
  impactBps: number;
  /** Pools the swap will go through, in order. */
  legs: number;
  fees: SwapFees | null;
  /** Miner fee the client sizes per leg, sats. */
  legMinerFeeSats: string;
  /** Miner fee of the staging transaction, sats. */
  stageFeeSats: string;
};

export type SwapPhase = 'queued' | 'staging' | 'relaying' | 'repricing' | 'returning' | 'done' | 'failed';

export type SwapLeg = {
  poolOutpoint: string;
  poolId: string;
  amountIn: string;
  amountOut: string;
  txid: string;
};

export type SwapStop = 'filled' | 'cancelled' | 'floor' | 'min' | 'no_pool' | 'fees';

export type SwapResult = {
  status: 'filled' | 'partial' | 'failed';
  stop: SwapStop;
  legs: SwapLeg[];
  totalIn: string;
  totalOut: string;
  unfilled: string;
  returned?: { txid: string; tokens: string } | { error: string };
};

export type SwapJob = {
  id: string;
  quote: SwapQuote;
  phase: SwapPhase;
  startedAt: number;
  updatedAt: number;
  /** Staging: what was reserved. */
  stagedSats?: string;
  stagedTokens?: string;
  /** Relaying or repricing: the pool in flight. */
  leg?: string;
  filled: SwapLeg[];
  result?: SwapResult;
  error?: string;
  errorKind?: string;
  /** Set once the job's reserved funds were returned after a thrown error. */
  recovered?: boolean;
};

/** Where a 1Color token stands on the exchange, for the coin detail page. */
export type SwapTokenStatus = {
  tokenId: string;
  /** The exchange has no origin on this chain: no swap UI at all. */
  available: boolean;
  listed: boolean;
  pools: number;
  /** Sats per whole token, from the exchange, when a pool exists. */
  marginalPrice: number | null;
  /** This wallet can list the token (its deployer, by the exchange's own rule). */
  canList: boolean;
  /** The exchange's one-time listing fee, sats, when it publishes one. */
  listFeeSats?: number;
};

export type SwapListedToken = {
  tokenId: string;
  sym: string;
  dec: number;
  icon?: string;
  pools: number;
  marginalPrice: number | null;
};

/** Popup → background actions. */
export const SWAP_ACTIONS = {
  QUOTE: 'SWAP_QUOTE',
  START: 'SWAP_START',
  STATUS: 'SWAP_STATUS',
  LIST_JOBS: 'SWAP_LIST_JOBS',
  CANCEL: 'SWAP_CANCEL',
  TOKEN_STATUS: 'SWAP_TOKEN_STATUS',
  LISTED_TOKENS: 'SWAP_LISTED_TOKENS',
  ENABLE_TOKEN: 'SWAP_ENABLE_TOKEN',
  MOVE_BACK: 'SWAP_MOVE_BACK',
} as const;

/** Background → popup broadcast carrying a job after each change. */
export const SWAP_PROGRESS_EVENT = 'swapProgress';
