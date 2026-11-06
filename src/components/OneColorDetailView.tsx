import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpFromLine,
  Droplets,
  ExternalLink,
  Info,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { oneColorTicker, type OneColorBalance } from '../services/oneColor';
import { swapEnableToken, swapJobs, swapMoveBack, swapMoveBackSats, swapTokenStatus } from '../services/swap';
import type { SwapTokenStatus } from '../services/swapTypes';
import { ammSiteUrlOf, GENERIC_TOKEN_ICON } from '../utils/constants';
import { displayAmount, formatTokenAmount, formatUSD } from '../utils/format';
import { getErrorMessage } from '../utils/tools';
import { CoinHistory } from './CoinHistory';
import { PriceChart } from './PriceChart';
import { Skeleton } from './Skeleton';
import { SendConfirmation, type SendLineItem } from './SendConfirmation';
import { Show } from './Show';

export type OneColorDetailViewProps = {
  token: OneColorBalance;
  /** BSV per whole token from the wallet's own pool read, when a pool exists. */
  priceBsv?: number;
  /** USD per BSV. */
  bsvUsdRate: number;
  chain: 'main' | 'test';
  onBack: () => void;
  onReceive: () => void;
  onSend: () => void;
  /** Buy: open the swap prefilled to buy this token. Only called when enabled. */
  onBuy: (status: SwapTokenStatus) => void;
  /** Changes when a send or swap finished, so History reloads. */
  refreshKey?: string;
};

/** Amber, matching AssetRow's pending pill. */
const PENDING_COLOR = '#f2b84b';
const ROW_BORDER = '1px solid rgba(255,255,255,0.06)';
const SATS_PER_BSV = 1e8;

type ExchangeState = 'loading' | 'unavailable' | 'pools' | 'no-pool' | 'unlisted';

const exchangeStateOf = (status: SwapTokenStatus | null, loading: boolean): ExchangeState => {
  if (loading) return 'loading';
  if (!status || !status.available) return 'unavailable';
  if (!status.listed) return 'unlisted';
  return status.pools > 0 ? 'pools' : 'no-pool';
};

const hostOf = (url: string) => url.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');

/**
 * A 1Color token's own page: balance, where it stands on Open Exchange,
 * Receive / Buy / Send, and its history. Listing the token runs through the
 * in-app confirmation; Buy is only live once a pool exists.
 */
export const OneColorDetailView = ({
  token,
  priceBsv,
  bsvUsdRate,
  chain,
  onBack,
  onReceive,
  onSend,
  onBuy,
  refreshKey,
}: OneColorDetailViewProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [status, setStatus] = useState<SwapTokenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusKey, setStatusKey] = useState(0);
  const [confirmList, setConfirmList] = useState<SendLineItem[] | null>(null);
  const [isListing, setIsListing] = useState(false);
  /** A swap of this token the background is still running: its reserved funds are spoken for. */
  const [swapInFlight, setSwapInFlight] = useState(false);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    swapJobs()
      .then((jobs) => {
        if (cancelled) return;
        setSwapInFlight(
          jobs.some(
            (j) => j.quote.request.token.tokenId === token.assetId && j.phase !== 'done' && j.phase !== 'failed',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setSwapInFlight(false);
      });
    swapTokenStatus(token.assetId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        console.warn('[OneColorDetailView] swapTokenStatus failed:', err);
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token.assetId, statusKey, refreshKey]);

  const ticker = oneColorTicker(token);
  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const primaryGradient = `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`;
  const primaryText = theme.color.component.primaryButtonText;

  const state = exchangeStateOf(status, loading);
  const buyEnabled = state === 'pools' && !!status;
  // The chart layout is chosen before the exchange answers when the Coins page already
  // priced the token from a pool, so the page does not open in one shape and snap into another.
  const chartLayout = state === 'pools' || (state === 'loading' && priceBsv !== undefined && priceBsv > 0);
  const wholeTokens = Number(token.available) / 10 ** token.dec;
  const usdValue = priceBsv !== undefined && priceBsv > 0 ? priceBsv * bsvUsdRate * wholeTokens : undefined;
  // Prefer the wallet's own pool read; fall back to the exchange's marginal price.
  const statusPriceBsv =
    priceBsv !== undefined && priceBsv > 0
      ? priceBsv
      : status?.marginalPrice
        ? status.marginalPrice / SATS_PER_BSV
        : undefined;
  const tokensPerBsv =
    statusPriceBsv !== undefined
      ? (1 / statusPriceBsv).toLocaleString(undefined, { maximumSignificantDigits: 6 })
      : undefined;
  const ammSiteUrl = ammSiteUrlOf(chain);

  const buyDisabledReason =
    state === 'loading'
      ? 'Checking Open Exchange…'
      : state === 'unavailable'
        ? `Open Exchange is not available on ${chain === 'test' ? 'testnet' : 'mainnet'}`
        : state === 'unlisted'
          ? `${ticker} is not listed on Open Exchange`
          : `No pool for ${ticker} yet`;

  const openListConfirm = () => {
    if (!status) return;
    setConfirmList([
      {
        address: 'Open Exchange listing fee',
        amount:
          status.listFeeSats !== undefined ? `${status.listFeeSats.toLocaleString()} sats` : 'set by the exchange',
      },
    ]);
  };

  const runListing = useCallback(async () => {
    setIsListing(true);
    try {
      const ok = await swapEnableToken(token.assetId);
      if (!ok) throw new Error('The exchange did not accept the listing.');
      addSnackbar(`Listing sent. ${ticker} appears on the exchange once it is processed.`, 'success', 4000);
      setStatusKey((k) => k + 1);
    } catch (err) {
      console.error('[OneColorDetailView] swapEnableToken failed:', err);
      addSnackbar(getErrorMessage(err), 'error');
    } finally {
      setIsListing(false);
      setConfirmList(null);
    }
  }, [token.assetId, ticker, addSnackbar]);

  const reservedTokens = status ? BigInt(status.reservedTokens || '0') : 0n;
  const reservedSats = status ? BigInt(status.reservedSats || '0') : 0n;
  const hasReserved = reservedTokens > 0n || reservedSats > 0n;

  /** Return what an unfinished swap staged: the token first, then the sats. */
  const returnReserved = useCallback(async () => {
    setReturning(true);
    try {
      if (reservedTokens > 0n) await swapMoveBack(token.assetId);
      if (reservedSats > 0n) await swapMoveBackSats();
      addSnackbar('Reserved funds are back in your wallet.', 'success', 3000);
      setStatusKey((k) => k + 1);
    } catch (err) {
      console.error('[OneColorDetailView] return reserved failed:', err);
      addSnackbar(getErrorMessage(err), 'error');
    } finally {
      setReturning(false);
    }
  }, [token.assetId, reservedTokens, reservedSats, addSnackbar]);

  const actionButton = (
    label: string,
    Icon: typeof ArrowDownToLine,
    onClick: () => void,
    enabled = true,
    title?: string,
  ) => (
    <motion.button
      type="button"
      whileTap={enabled ? { scale: 0.96 } : undefined}
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      aria-disabled={!enabled}
      title={title}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold outline-none"
      style={
        enabled
          ? { background: primaryGradient, color: primaryText, border: 'none', cursor: 'pointer' }
          : {
              background: '#17191E',
              color: gray,
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'not-allowed',
            }
      }
    >
      <Icon size={15} />
      {label}
    </motion.button>
  );

  const divider = <span className="h-3 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 35 }}
        className="flex flex-col w-full pt-3 pb-4 overflow-y-auto overflow-x-hidden self-start"
        style={{
          height: '100%',
          backgroundColor: theme.color.global.walletBackground,
          fontFamily: "'Inter', Arial, Helvetica, sans-serif",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 mb-5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
            style={{ backgroundColor: '#17191E' }}
          >
            <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
          </motion.button>
          <img
            src={token.icon || GENERIC_TOKEN_ICON}
            alt=""
            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
          />
          <span className="text-base font-bold truncate" style={{ color: contrast }}>
            {ticker}
          </span>
          <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: gray }}>
            1Color · {chain === 'test' ? 'testnet' : 'mainnet'}
          </span>
        </div>

        {/* With a pool: the price chart leads, and the balance is a compact card under it */}
        <Show when={chartLayout}>
          <div className="w-full mb-3">
            <PriceChart
              tokenId={token.assetId}
              ticker={ticker}
              dec={token.dec}
              bsvUsdRate={bsvUsdRate}
              currentSatsPerToken={statusPriceBsv !== undefined ? statusPriceBsv * SATS_PER_BSV : null}
            />
          </div>
          <div className="px-4 mb-4">
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
              style={{ background: row, border: ROW_BORDER }}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs" style={{ color: gray }}>
                  Your balance
                </span>
                <span
                  className="text-base font-bold truncate"
                  style={{ color: contrast }}
                  title={`${formatTokenAmount(token.available, token.dec)} ${ticker}`}
                >
                  {displayAmount(token.available, token.dec)} {ticker}
                </span>
                <Show when={token.pending > 0n}>
                  <span
                    title="Held by a send that the recipient has not claimed yet. It becomes spendable again when that send settles or expires."
                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none cursor-help self-start"
                    style={{ color: PENDING_COLOR, backgroundColor: `${PENDING_COLOR}26` }}
                  >
                    <Info size={10} strokeWidth={2.5} />
                    {displayAmount(token.pending, token.dec)} pending
                  </span>
                </Show>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-xs" style={{ color: gray }}>
                  Value
                </span>
                <span className="text-base font-bold" style={{ color: contrast }}>
                  {usdValue !== undefined ? formatUSD(usdValue) : '—'}
                </span>
                <span className="text-[11px]" style={{ color: gray }}>
                  {status ? (
                    status.pools === 1 ? (
                      '1 pool'
                    ) : (
                      `${status.pools} pools`
                    )
                  ) : (
                    <Skeleton className="h-3 w-12 inline-block" />
                  )}
                </span>
              </div>
            </div>
          </div>
        </Show>

        {/* Balance (no chart) */}
        <Show when={!chartLayout}>
          <div className="flex flex-col items-center w-full px-4 mb-3 gap-1">
            <span className="text-xs" style={{ color: gray }}>
              Balance
            </span>
            <span
              className="text-[32px] font-bold leading-tight break-all text-center"
              style={{ color: contrast }}
              title={formatTokenAmount(token.available, token.dec)}
            >
              {displayAmount(token.available, token.dec)}
            </span>
            <span className="text-sm" style={{ color: gray }}>
              {usdValue !== undefined ? formatUSD(usdValue) : 'No market price yet'}
            </span>
            <Show when={token.pending > 0n}>
              <span
                title="Held by a send that the recipient has not claimed yet. It becomes spendable again when that send settles or expires."
                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none cursor-help"
                style={{ color: PENDING_COLOR, backgroundColor: `${PENDING_COLOR}26` }}
              >
                <Info size={10} strokeWidth={2.5} />
                {displayAmount(token.pending, token.dec)} pending
              </span>
            </Show>
          </div>
        </Show>

        {/* Exchange status line (the chart covers it when there is a pool) */}
        <Show when={!chartLayout}>
          <div
            className="flex items-center justify-center gap-2 px-4 mb-4 min-h-[18px] text-xs"
            style={{ color: gray }}
          >
            {state === 'loading' && (
              <motion.div
                className="h-3 w-40 rounded-full"
                style={{ backgroundColor: row }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
              />
            )}
            {state === 'pools' && (
              <>
                {tokensPerBsv !== undefined && (
                  <>
                    <span>
                      Price{' '}
                      <span style={{ color: contrast }}>
                        1 BSV = {tokensPerBsv} {ticker}
                      </span>
                    </span>
                    {divider}
                  </>
                )}
                <span>
                  Pools <span style={{ color: contrast }}>{status?.pools}</span>
                </span>
              </>
            )}
            {state === 'no-pool' && (
              <>
                <Info size={12} />
                <span>Listed on Open Exchange · no pool yet</span>
              </>
            )}
            {state === 'unlisted' && (
              <>
                <Info size={12} />
                <span>Not on Open Exchange</span>
              </>
            )}
          </div>
        </Show>

        {/* Actions */}
        <div className="flex flex-col items-center w-full mb-5">
          <div className="flex w-[88%]" style={{ gap: 10 }}>
            {actionButton('Receive', ArrowDownToLine, onReceive)}
            {actionButton(
              'Buy',
              ArrowLeftRight,
              () => status && onBuy(status),
              buyEnabled,
              buyEnabled ? `Buy ${ticker} with BSV` : buyDisabledReason,
            )}
            {actionButton('Send', ArrowUpFromLine, onSend)}
          </div>
          <Show when={buyEnabled}>
            <p className="text-[11px] text-center mt-2 px-6" style={{ color: gray }}>
              Buy opens Swap with BSV → {ticker} filled in. Flip there to sell.
            </p>
          </Show>
        </div>

        {/* Provide liquidity: a small link out to the pool site, when there is one on this chain */}
        <Show when={chartLayout && !!ammSiteUrl}>
          <div className="px-4 mb-5">
            <a
              href={ammSiteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline"
              style={{ background: 'rgba(23,25,30,0.6)', border: ROW_BORDER, color: contrast }}
            >
              <Droplets size={15} style={{ color: '#A1FF8B', flexShrink: 0 }} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs font-semibold">Provide liquidity</span>
                <span className="text-[10px] truncate" style={{ color: gray }}>
                  Earn a share of {ticker} swap fees on {ammSiteUrl ? hostOf(ammSiteUrl) : ''}
                </span>
              </div>
              <ExternalLink size={12} style={{ color: gray, flexShrink: 0 }} />
            </a>
          </div>
        </Show>

        {/* Reserved by a swap: in flight, or left behind when the wallet stopped mid-swap */}
        <Show when={hasReserved}>
          <div className="px-4 mb-5">
            <div
              className="flex flex-col gap-2 rounded-xl"
              style={{ background: row, border: ROW_BORDER, padding: 14 }}
            >
              <span className="text-sm font-semibold" style={{ color: contrast }}>
                {swapInFlight ? 'A swap is in progress' : 'Reserved by a swap that did not finish'}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: gray }}>
                {reservedTokens > 0n ? `${displayAmount(reservedTokens, token.dec)} ${ticker}` : ''}
                {reservedTokens > 0n && reservedSats > 0n ? ' and ' : ''}
                {reservedSats > 0n ? `${displayAmount(reservedSats, 8)} BSV` : ''}
                {swapInFlight
                  ? ' is held for it. It lands or comes back when the swap finishes.'
                  : ' is held in the swap basket. Return it to your balance; nothing is lost.'}
              </span>
              {!swapInFlight && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void returnReserved()}
                  disabled={returning}
                  className="flex items-center justify-center gap-1.5 w-full mt-1 py-2.5 rounded-2xl text-xs font-semibold outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'transparent', border: '1px solid #34D399', color: '#A1FF8B' }}
                >
                  {returning ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  {returning ? 'Returning…' : 'Return to wallet'}
                </motion.button>
              )}
            </div>
          </div>
        </Show>

        {/* Status card */}
        <Show when={state === 'no-pool' || state === 'unlisted'}>
          <div className="px-4 mb-5">
            <div
              className="flex flex-col gap-2 rounded-xl"
              style={{ background: row, border: ROW_BORDER, padding: 14 }}
            >
              {state === 'no-pool' ? (
                <>
                  <span className="text-sm font-semibold" style={{ color: contrast }}>
                    Nobody has opened a pool for {ticker}
                  </span>
                  <span className="text-xs leading-relaxed" style={{ color: gray }}>
                    A pool pairs {ticker} with BSV so it can be bought and sold. Buy turns on here as soon as a pool
                    exists.
                  </span>
                  {ammSiteUrl ? (
                    <a
                      href={ammSiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 mt-1 py-2.5 rounded-2xl text-xs font-semibold no-underline"
                      style={{ border: '1px solid #34D399', color: '#A1FF8B' }}
                    >
                      <ExternalLink size={13} />
                      Open a pool on {hostOf(ammSiteUrl)}
                    </a>
                  ) : (
                    <span className="text-xs text-center mt-1" style={{ color: gray }}>
                      Opening pools on mainnet isn't available yet.
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold" style={{ color: contrast }}>
                    {ticker} isn't listed on Open Exchange
                  </span>
                  <span className="text-xs leading-relaxed" style={{ color: gray }}>
                    Listing lets the exchange validate {ticker} swaps and open pools for it. It is a one-time fee paid
                    from this wallet.
                  </span>
                  {status?.canList ? (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={openListConfirm}
                      disabled={isListing}
                      className="flex items-center justify-center w-full mt-1 py-3 rounded-2xl text-[13px] font-semibold outline-none border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: primaryGradient, color: primaryText }}
                    >
                      List {ticker} on Open Exchange
                    </motion.button>
                  ) : (
                    <span className="text-xs text-center mt-1" style={{ color: gray }}>
                      Only the token's deployer can list it.
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </Show>

        {/* History */}
        <div className="w-full px-4">
          <CoinHistory
            title="History"
            filter={{ type: '1color', assetId: token.assetId, decimals: token.dec, symbol: token.sym }}
            refreshKey={refreshKey}
          />
        </div>
      </motion.div>
      <SendConfirmation
        show={!!confirmList}
        theme={theme}
        icon={token.icon || GENERIC_TOKEN_ICON}
        lineItems={confirmList ?? []}
        title="Confirm listing"
        confirmLabel="List token"
        processingMessage="Sending the listing..."
        isProcessing={isListing}
        onConfirm={() => void runListing()}
        onCancel={() => setConfirmList(null)}
      />
    </>
  );
};
