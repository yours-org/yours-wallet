import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import bsvCoin from '../assets/bsv-coin.svg';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { oneColorTicker, type OneColorBalance } from '../services/oneColor';
import { onSwapProgress, swapCancel, swapListedTokens, swapQuote, swapStart, swapStatus } from '../services/swap';
import type {
  SwapJob,
  SwapListedToken,
  SwapPhase,
  SwapQuote,
  SwapQuoteRequest,
  SwapSide,
  SwapTokenRef,
} from '../services/swapTypes';
import { GENERIC_TOKEN_ICON, SWAP_DEFAULT_SLIPPAGE_PCT, SWAP_MAX_SOURCES } from '../utils/constants';
import { formatUSD, showAmount } from '../utils/format';
import { getErrorMessage } from '../utils/tools';
import {
  acceptsAmountInput,
  bpsToPercentText,
  compactAmount,
  stopText,
  formatRate,
  parseAmount,
  shortOutpoint,
  subtractCushion,
  swapErrorText,
  tokensPerBsv,
} from './swapViewHelpers';

export type SwapViewProps = {
  /** Prefilled token (e.g. from a coin detail's Buy button). Undefined when opened from the Coins page: the picker starts empty and the user picks a token. */
  token?: SwapTokenRef & { icon?: string };
  initialSide?: SwapSide; // default 'buy'
  /** Spendable BSV in sats (for Max when buying) */
  bsvBalanceSats: bigint;
  /** USD per BSV, for the ≈ $ lines */
  bsvUsdRate: number;
  /** The wallet's held 1Color tokens (for the picker when selling, and balances). */
  heldTokens: OneColorBalance[];
  onBack: () => void;
  /** A swap finished (filled, partial or failed after staging): the parent refreshes balances. Called once per finished job. */
  onFinished: () => void;
};

type PickedToken = SwapTokenRef & { icon?: string };
type Screen = 'form' | 'confirm' | 'progress' | 'done';
type Asset = { ticker: string; dec: number; icon: string };

const BSV_DEC = 8;
const FEE_CUSHION_SATS = 2000n;
const SLIPPAGE_CHOICES = [0.5, 1, 2, 5];
const QUOTE_DEBOUNCE_MS = 400;
const QUOTE_REFRESH_MS = 5000;
const STATUS_POLL_MS = 2000;

const GREEN = '#34D399';
const AMBER = '#F79009';
const CARD_BORDER = '1px solid rgba(255,255,255,0.06)';

const PHASE_ORDER: Record<SwapPhase, number> = {
  queued: 0,
  staging: 1,
  relaying: 2,
  repricing: 2,
  returning: 3,
  done: 4,
  failed: 4,
};

const tickerOf = (t: { sym?: string; tokenId: string }) => oneColorTicker({ sym: t.sym, assetId: t.tokenId });
const isFinished = (job: SwapJob) => job.phase === 'done' || job.phase === 'failed';
const safeBig = (s: string | undefined): bigint => {
  try {
    return BigInt(s ?? '0');
  } catch {
    return 0n;
  }
};
const fmt = (s: string | bigint | undefined, dec: number) =>
  compactAmount(showAmount(typeof s === 'bigint' ? s : safeBig(s), dec));
const satsToUsd = (sats: bigint, rate: number) => (Number(sats) / 1e8) * rate;

export const SwapView = (props: SwapViewProps) => {
  const {
    token: initialToken,
    initialSide = 'buy',
    bsvBalanceSats,
    bsvUsdRate,
    heldTokens,
    onBack,
    onFinished,
  } = props;
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();

  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const bg = theme.color.global.walletBackground;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const primaryText = theme.color.component.primaryButtonText;
  const red = theme.color.component.snackbarError;
  const primaryGradient = `linear-gradient(135deg, ${accent}, ${accentRight})`;

  const [screen, setScreen] = useState<Screen>('form');
  const [side, setSide] = useState<SwapSide>(initialSide);
  const [token, setToken] = useState<PickedToken | undefined>(initialToken);
  const [amountInput, setAmountInput] = useState('');
  const [slippagePct, setSlippagePct] = useState<number>(SWAP_DEFAULT_SLIPPAGE_PCT);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(!initialToken);
  const [listed, setListed] = useState<SwapListedToken[] | null>(null);
  const [listedError, setListedError] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<SwapJob | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const quoteSeq = useRef(0);
  const finishedJobs = useRef(new Set<string>());
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  // ---- Assets on each side -------------------------------------------------

  const bsvAsset: Asset = { ticker: 'BSV', dec: BSV_DEC, icon: bsvCoin };
  const tokenAsset: Asset | null = token
    ? { ticker: tickerOf(token), dec: token.dec, icon: token.icon || GENERIC_TOKEN_ICON }
    : null;
  const payAsset = side === 'buy' ? bsvAsset : tokenAsset;
  const recvAsset = side === 'buy' ? tokenAsset : bsvAsset;

  const heldById = useMemo(() => new Map(heldTokens.map((t) => [t.assetId, t])), [heldTokens]);
  const tokenBalance = token ? (heldById.get(token.tokenId)?.available ?? 0n) : 0n;
  const payBalance = side === 'buy' ? bsvBalanceSats : tokenBalance;
  const recvBalance = side === 'buy' ? tokenBalance : bsvBalanceSats;

  const parsed = payAsset ? parseAmount(amountInput, payAsset.dec) : null;
  const amountBase = parsed && parsed.ok ? BigInt(parsed.value) : null;
  const amountError =
    amountInput === '' || !parsed
      ? ''
      : !parsed.ok
        ? parsed.reason === 'decimals'
          ? `${payAsset?.ticker} has at most ${payAsset?.dec} decimal places.`
          : parsed.reason === 'invalid'
            ? 'Enter a number.'
            : ''
        : amountBase !== null && amountBase > payBalance
          ? `More than your ${payAsset?.ticker} balance.`
          : '';
  const amountValid = amountBase !== null && amountBase > 0n && amountBase <= payBalance;

  const request: SwapQuoteRequest | null = useMemo(() => {
    if (!token || amountBase === null || amountBase <= 0n) return null;
    return {
      token: { tokenId: token.tokenId, sym: token.sym, dec: token.dec },
      side,
      amountIn: amountBase.toString(),
      slippageBps: Math.round(slippagePct * 100),
      maxSources: SWAP_MAX_SOURCES,
    };
  }, [token, side, amountBase, slippagePct]);
  const requestKey = request ? JSON.stringify(request) : '';

  // ---- Listed tokens for the picker ---------------------------------------

  useEffect(() => {
    let alive = true;
    swapListedTokens()
      .then((list) => alive && setListed(list))
      .catch((error) => {
        console.error('[SwapView] listed tokens:', error);
        if (alive) {
          setListed([]);
          setListedError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const listedById = useMemo(() => new Map((listed ?? []).map((t) => [t.tokenId, t])), [listed]);

  const pickerRows = useMemo(() => {
    const rows: { ref: PickedToken; pools: number | null; held: boolean }[] = [];
    const seen = new Set<string>();
    for (const t of heldTokens) {
      if (seen.has(t.assetId)) continue;
      seen.add(t.assetId);
      const l = listedById.get(t.assetId);
      rows.push({
        ref: { tokenId: t.assetId, sym: t.sym || l?.sym || '', dec: t.dec, icon: t.icon || l?.icon },
        pools: listed ? (l?.pools ?? 0) : null,
        held: true,
      });
    }
    for (const l of listed ?? []) {
      if (seen.has(l.tokenId)) continue;
      seen.add(l.tokenId);
      rows.push({ ref: { tokenId: l.tokenId, sym: l.sym, dec: l.dec, icon: l.icon }, pools: l.pools, held: false });
    }
    // Swappable tokens first; the ones with no pool (greyed, not selectable) sink to the bottom.
    // A stable sort keeps held-before-listed within each group.
    return rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => Number(a.r.pools === 0) - Number(b.r.pools === 0) || a.i - b.i)
      .map(({ r }) => r);
  }, [heldTokens, listed, listedById]);

  // ---- Quoting -------------------------------------------------------------

  const runQuote = useCallback(async (req: SwapQuoteRequest, quiet: boolean) => {
    const seq = ++quoteSeq.current;
    if (!quiet) setQuoteLoading(true);
    try {
      const q = await swapQuote(req);
      if (seq !== quoteSeq.current) return;
      setQuote(q);
      setQuoteError('');
    } catch (error) {
      if (seq !== quoteSeq.current) return;
      setQuote(null);
      setQuoteError(getErrorMessage(error));
    } finally {
      if (seq === quoteSeq.current) setQuoteLoading(false);
    }
  }, []);

  const formVisible = screen === 'form' && !pickerOpen;

  useEffect(() => {
    // A change to the inputs invalidates the old quote; a pending answer for it is dropped.
    quoteSeq.current++;
    setQuote(null);
    setQuoteError('');
    setQuoteLoading(false);
    // requestKey stands for request's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  useEffect(() => {
    // Quote while the form is on screen. Leaving it (the picker, the confirm step) only stops the
    // timers: the quote the user is confirming must stay.
    if (!request || !formVisible) return;
    setQuoteLoading(true);
    const debounce = setTimeout(() => void runQuote(request, false), QUOTE_DEBOUNCE_MS);
    const refresh = setInterval(() => void runQuote(request, true), QUOTE_REFRESH_MS);
    return () => {
      clearTimeout(debounce);
      clearInterval(refresh);
      setQuoteLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, formVisible, runQuote]);

  // A quote only counts when it answers the request on screen.
  const liveQuote = quote && request && JSON.stringify(quote.request) === requestKey ? quote : null;

  // ---- Job progress --------------------------------------------------------

  const jobId = job?.id;
  const finished = job ? isFinished(job) : false;

  const acceptJob = useCallback((next: SwapJob) => {
    setJob((prev) => (prev && prev.id === next.id && prev.updatedAt > next.updatedAt ? prev : next));
    if (isFinished(next)) {
      if (!finishedJobs.current.has(next.id)) {
        finishedJobs.current.add(next.id);
        onFinishedRef.current();
      }
      setScreen((s) => (s === 'progress' ? 'done' : s));
    }
  }, []);

  useEffect(() => {
    // Stops once the job is finished; unmount clears it too.
    if (!jobId || finished) return;
    const unsubscribe = onSwapProgress((j) => {
      if (j.id === jobId) acceptJob(j);
    });
    let stopped = false;
    const poll = async () => {
      try {
        const j = await swapStatus(jobId);
        if (!stopped && j) acceptJob(j);
      } catch (error) {
        console.error('[SwapView] status poll:', error);
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, STATUS_POLL_MS);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
      unsubscribe();
    };
  }, [jobId, finished, acceptJob]);

  // ---- Actions -------------------------------------------------------------

  const flip = () => {
    const nextSide: SwapSide = side === 'buy' ? 'sell' : 'buy';
    const nextPayDec = nextSide === 'buy' ? BSV_DEC : (token?.dec ?? 0);
    setSide(nextSide);
    setAmountInput(liveQuote ? fmt(liveQuote.amountOut, nextPayDec) : '');
  };

  const setMax = () => {
    if (!payAsset) return;
    const max = side === 'buy' ? subtractCushion(bsvBalanceSats, FEE_CUSHION_SATS) : tokenBalance;
    setAmountInput(max > 0n ? fmt(max, payAsset.dec) : '0');
  };

  const pick = (ref: PickedToken, pools: number | null) => {
    if (pools === 0) {
      addSnackbar(`No pool for ${tickerOf(ref)} yet`, 'info');
      return;
    }
    if (!token || token.tokenId !== ref.tokenId) {
      setToken(ref);
      if (side === 'sell') setAmountInput('');
    }
    setPickerOpen(false);
  };

  const onAmountChange = (value: string) => {
    const dec = payAsset?.dec ?? BSV_DEC;
    if (acceptsAmountInput(value, dec)) setAmountInput(value);
  };

  const confirmSwap = async () => {
    if (!liveQuote) return;
    setStarting(true);
    try {
      const started = await swapStart(liveQuote.request);
      setJob(started);
      setScreen(isFinished(started) ? 'done' : 'progress');
      if (isFinished(started)) acceptJob(started);
    } catch (error) {
      addSnackbar(getErrorMessage(error), 'error');
      setScreen('form');
    } finally {
      setStarting(false);
    }
  };

  const stopAfterPool = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await swapCancel(jobId);
      addSnackbar('The swap stops after the pool in flight.', 'info');
    } catch (error) {
      setCancelling(false);
      addSnackbar(getErrorMessage(error), 'error');
    }
  };

  const swapAgain = () => {
    if (job) {
      const req = job.quote.request;
      setSide(req.side);
      setToken((t) =>
        t && t.tokenId === req.token.tokenId ? t : { ...req.token, icon: heldById.get(req.token.tokenId)?.icon },
      );
    }
    setJob(null);
    setCancelling(false);
    setAmountInput('');
    setScreen('form');
  };

  // ---- Shared bits ---------------------------------------------------------

  const usdText = (sats: bigint | null) =>
    sats === null || !bsvUsdRate ? '' : `≈ ${formatUSD(satsToUsd(sats, bsvUsdRate))}`;

  const minerSats = (q: SwapQuote) => safeBig(q.legMinerFeeSats) * BigInt(q.legs) + safeBig(q.stageFeeSats);
  const poolsText = (n: number) => `${n} pool${n === 1 ? '' : 's'}`;

  const header = (title: string, right?: React.ReactNode) => (
    <div className="flex items-center gap-3 px-4 mb-5">
      <motion.button
        type="button"
        aria-label="Back"
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          // Back steps through the flow: picker → form, confirm → form; done → leave.
          // Progress leaves too (the swap keeps running in the background).
          if (screen === 'form' && pickerOpen && token) setPickerOpen(false);
          else if (screen === 'confirm' && !starting) setScreen('form');
          else onBack();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
        style={{ backgroundColor: '#17191E' }}
      >
        <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
      </motion.button>
      <span className="text-base font-bold flex-1" style={{ color: contrast }}>
        {title}
      </span>
      {right}
    </div>
  );

  const primaryButton = (label: string, onClick: () => void, disabled = false) => (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className="w-full py-3 rounded-2xl text-sm font-bold border-none outline-none cursor-pointer disabled:cursor-not-allowed"
      style={{ background: primaryGradient, color: primaryText, opacity: disabled ? 0.4 : 1 }}
    >
      {label}
    </motion.button>
  );

  const outlinedButton = (label: string, onClick: () => void) => (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full py-3 rounded-2xl text-sm font-semibold outline-none cursor-pointer"
      style={{ background: 'transparent', color: contrast, border: `1px solid ${accent}` }}
    >
      {label}
    </motion.button>
  );

  const tokenChip = (asset: Asset | null, onClick?: () => void, label = 'Choose token') => {
    const content = (
      <>
        {asset ? <img src={asset.icon} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : null}
        <span className="text-sm font-semibold" style={{ color: asset ? contrast : primaryText }}>
          {asset ? asset.ticker : 'Select'}
        </span>
        {onClick ? <ChevronDown size={14} style={{ color: asset ? gray : primaryText }} /> : null}
      </>
    );
    if (!onClick) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: bg }}>
          {content}
        </div>
      );
    }
    return (
      <motion.button
        type="button"
        aria-label={label}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0 border-none outline-none cursor-pointer"
        style={{ background: asset ? bg : primaryGradient }}
      >
        {content}
      </motion.button>
    );
  };

  const openPicker = () => {
    setSlippageOpen(false);
    setPickerOpen(true);
  };

  // ---- Form ----------------------------------------------------------------

  // The same picker the send flow uses (AssetPicker): a search box, a section label and
  // one row per token with its balance on the right. Tokens with no pool sit at the
  // bottom, greyed, and say why.
  const renderPicker = () => {
    const q = pickerQuery.trim().toLowerCase();
    const rows = q
      ? pickerRows.filter(({ ref }) => tickerOf(ref).toLowerCase().includes(q) || ref.tokenId.includes(q))
      : pickerRows;
    const poolsText = (n: number) => (n === 1 ? '1 pool' : `${n} pools`);
    return (
      <div className="flex flex-col items-center w-full px-4">
        <div className="relative w-full mb-4">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: gray }}
          />
          <input
            type="text"
            aria-label="Search tokens"
            placeholder="Search tokens..."
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl text-sm outline-none border transition-all duration-200"
            style={{
              backgroundColor: row,
              borderColor: gray + '40',
              color: contrast,
              fontFamily: "'Inter', Arial, Helvetica, sans-serif",
            }}
          />
        </div>

        <div className="flex items-center w-full mb-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: gray }}>
            {side === 'sell' ? 'Select a token to sell' : 'Select a token to buy'}
          </span>
          <div className="flex-1 ml-3 h-px opacity-20" style={{ backgroundColor: gray }} />
        </div>

        {listed === null && rows.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color: gray }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 w-full">
            <p className="text-sm text-center" style={{ color: gray }}>
              {q
                ? `No tokens match "${pickerQuery}"`
                : listedError
                  ? 'Could not load the exchange’s tokens.'
                  : 'No tokens are listed on the exchange yet.'}
            </p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2">
            {rows.map(({ ref, pools, held }) => {
              const muted = pools === 0;
              const selected = token?.tokenId === ref.tokenId;
              const heldBal = heldById.get(ref.tokenId);
              const primary =
                held && heldBal
                  ? `${fmt(heldBal.available, heldBal.dec)} ${tickerOf(ref)}`
                  : pools
                    ? poolsText(pools)
                    : '—';
              const secondary =
                pools === null ? 'Checking…' : muted ? 'No pool yet' : held && heldBal ? poolsText(pools) : 'Listed';
              return (
                <motion.button
                  key={ref.tokenId}
                  type="button"
                  whileHover={muted ? undefined : { scale: 1.01 }}
                  whileTap={muted ? undefined : { scale: 0.99 }}
                  onClick={() => pick(ref, pools)}
                  aria-disabled={muted}
                  className="flex items-center justify-between w-full px-3 py-3 rounded-xl outline-none cursor-pointer text-left"
                  style={{
                    background: row,
                    border: selected ? `1px solid ${accent}55` : `1px solid ${gray}14`,
                    opacity: muted ? 0.45 : 1,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={ref.icon || GENERIC_TOKEN_ICON}
                      alt={tickerOf(ref)}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-semibold leading-tight" style={{ color: contrast }}>
                        {tickerOf(ref)}
                      </span>
                      <span className="text-[10px] mt-0.5 font-mono truncate max-w-[10rem]" style={{ color: gray }}>
                        {ref.tokenId}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end min-w-0 max-w-[40%] ml-3">
                    <span className="text-sm font-semibold text-right leading-tight" style={{ color: contrast }}>
                      {primary}
                    </span>
                    <span className="text-xs mt-0.5 text-right" style={{ color: gray }}>
                      {secondary}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
        <div aria-hidden className="h-4 w-full flex-shrink-0"></div>
      </div>
    );
  };

  const renderForm = () => {
    const q = liveQuote;
    const recvAmount = q && recvAsset ? fmt(q.amountOut, recvAsset.dec) : '';
    const paySatsValue = side === 'buy' ? amountBase : q ? safeBig(q.amountOut) : null;
    const recvSatsValue = q ? (side === 'buy' ? safeBig(q.amountIn) : safeBig(q.amountOut)) : null;
    const impactPct = q ? q.impactBps / 100 : 0;
    const impactColor = impactPct <= 1 ? GREEN : impactPct <= 3 ? AMBER : red;
    const feeTotalBps = q?.fees ? q.fees.lpBps + q.fees.validatorBps + q.fees.commissionBps : 0;

    return (
      <>
        {/* Pay / receive cards with the flip button between them */}
        <div className="relative flex flex-col px-4 gap-1.5">
          <div className="rounded-2xl px-4 py-3" style={{ background: row, border: CARD_BORDER }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: gray }}>
                You pay
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: gray }}>
                  Balance {payAsset ? fmt(payBalance, payAsset.dec) : '—'}
                </span>
                {payAsset ? (
                  <button
                    type="button"
                    onClick={setMax}
                    className="text-[11px] font-bold bg-transparent border-none outline-none cursor-pointer p-0"
                    style={{ color: accent }}
                  >
                    Max
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                aria-label="Amount to pay"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amountInput}
                disabled={!payAsset}
                onChange={(e) => onAmountChange(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none font-bold"
                style={{ fontSize: 28, color: contrast }}
              />
              {side === 'buy' ? tokenChip(bsvAsset) : tokenChip(tokenAsset, openPicker, 'Choose token to sell')}
            </div>
            <div className="flex items-center justify-between mt-1 min-h-[16px]">
              <span className="text-[11px]" style={{ color: gray }}>
                {usdText(paySatsValue)}
              </span>
              {amountError ? (
                <span className="text-[11px]" style={{ color: red }}>
                  {amountError}
                </span>
              ) : null}
            </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: 'calc(50% - 18px)' }}>
            <motion.button
              type="button"
              aria-label="Flip pay and receive"
              whileTap={{ scale: 0.9, rotate: 180 }}
              onClick={flip}
              disabled={!token}
              className="flex items-center justify-center w-9 h-9 rounded-full outline-none cursor-pointer"
              style={{ background: row, border: `3px solid ${bg}` }}
            >
              <ArrowUpDown size={16} style={{ color: contrast }} />
            </motion.button>
          </div>

          <div className="rounded-2xl px-4 py-3" style={{ background: row, border: CARD_BORDER }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: gray }}>
                You receive
              </span>
              <span className="text-[11px]" style={{ color: gray }}>
                Balance {recvAsset ? fmt(recvBalance, recvAsset.dec) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2" style={{ height: 40 }}>
                {quoteLoading && !q ? (
                  <Loader2 size={20} className="animate-spin" style={{ color: gray }} />
                ) : (
                  <span
                    className="font-bold truncate"
                    style={{ fontSize: 28, color: recvAmount ? contrast : `${gray}80` }}
                  >
                    {recvAmount || '0'}
                  </span>
                )}
                {quoteLoading && q ? <Loader2 size={14} className="animate-spin" style={{ color: gray }} /> : null}
              </div>
              {side === 'sell' ? tokenChip(bsvAsset) : tokenChip(tokenAsset, openPicker, 'Choose token to buy')}
            </div>
            <div className="flex items-center justify-between mt-1 min-h-[16px] gap-2">
              <span className="text-[11px]" style={{ color: gray }}>
                {usdText(recvSatsValue)}
              </span>
              {q && recvAsset ? (
                <span className="text-[11px] truncate" style={{ color: gray }}>
                  at least {fmt(q.minAmountOut, recvAsset.dec)} after slippage
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {quoteError ? (
          <p className="text-xs px-5 mt-3 mb-0" style={{ color: red }}>
            {quoteError}
          </p>
        ) : null}

        {q && tokenAsset ? (
          <div
            className="flex flex-col gap-2 mx-4 mt-3 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: row, border: CARD_BORDER }}
          >
            <QuoteRow label="Rate" gray={gray} contrast={contrast}>
              1 BSV = {formatRate(tokensPerBsv(q.effectivePrice))} {tokenAsset.ticker}
            </QuoteRow>
            <QuoteRow label="Price impact" gray={gray} contrast={impactColor}>
              {bpsToPercentText(q.impactBps)}%
            </QuoteRow>
            <QuoteRow label="Route" gray={gray} contrast={contrast}>
              {poolsText(q.legs)}
            </QuoteRow>
            <button
              type="button"
              onClick={() => setFeesOpen((o) => !o)}
              aria-expanded={feesOpen}
              className="flex items-center justify-between gap-3 w-full bg-transparent border-0 outline-none cursor-pointer p-0 text-[12px]"
              style={{ color: gray, fontFamily: 'inherit' }}
            >
              <span className="flex items-center gap-1">
                Fees
                <ChevronDown
                  size={12}
                  style={{ transform: feesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                />
              </span>
              <span style={{ color: contrast }}>
                {bpsToPercentText(feeTotalBps)}% + ~{minerSats(q).toString()} sats
              </span>
            </button>
            {feesOpen && q.fees ? (
              <div
                className="flex flex-col gap-1.5 pl-3 text-[11px]"
                style={{ borderLeft: '2px solid rgba(255,255,255,0.08)' }}
              >
                <QuoteRow label="Liquidity providers" gray={gray} contrast={contrast}>
                  {bpsToPercentText(q.fees.lpBps)}%
                </QuoteRow>
                <QuoteRow label="Validator" gray={gray} contrast={contrast}>
                  {bpsToPercentText(q.fees.validatorBps)}%
                </QuoteRow>
                <QuoteRow label="Marketplace" gray={gray} contrast={contrast}>
                  {bpsToPercentText(q.fees.commissionBps)}%
                </QuoteRow>
                <QuoteRow label="Miner" gray={gray} contrast={contrast}>
                  ~{minerSats(q).toString()} sats across {poolsText(q.legs)}
                </QuoteRow>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-[11px] px-5 mt-3 mb-4" style={{ color: gray }}>
          Quote refreshes every few seconds from the exchange&apos;s live pools. The final amount is set when you
          confirm.
        </p>

        <div className="px-4 mt-auto sticky bottom-0 pt-3 pb-1" style={{ background: bg }}>
          {primaryButton('Review swap', () => setScreen('confirm'), !(q && amountValid))}
        </div>
      </>
    );
  };

  // ---- Confirm -------------------------------------------------------------

  const renderConfirm = () => {
    const q = liveQuote;
    if (!q || !payAsset || !recvAsset) return null;
    const feeTotalBps = q.fees ? q.fees.lpBps + q.fees.validatorBps + q.fees.commissionBps : 0;
    const valueRow = (label: string, value: string, strong = false) => (
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
        style={{ background: row, border: CARD_BORDER }}
      >
        <span className="text-xs" style={{ color: gray }}>
          {label}
        </span>
        <span className="text-sm font-semibold text-right" style={{ color: strong ? accent : contrast }}>
          {value}
        </span>
      </div>
    );
    return (
      <div className="flex flex-col px-4 flex-1">
        <div className="flex flex-col items-center text-center mt-2 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <img src={payAsset.icon} alt="" className="w-11 h-11 rounded-full object-cover" />
            <div className="flex items-center" style={{ gap: 6 }}>
              {[0.35, 0.65, 1].map((o) => (
                <span
                  key={o}
                  className="rounded-full"
                  style={{ width: 5, height: 5, background: accent, opacity: o }}
                />
              ))}
            </div>
            <img src={recvAsset.icon} alt="" className="w-11 h-11 rounded-full object-cover" />
          </div>
          <h2 className="text-lg font-bold m-0" style={{ color: contrast }}>
            Confirm swap
          </h2>
          <p className="text-xs m-0 mt-1" style={{ color: gray }}>
            Nothing leaves your wallet until you confirm.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {valueRow('You pay', `${fmt(q.amountIn, payAsset.dec)} ${payAsset.ticker}`)}
          {valueRow('You receive', `≈ ${fmt(q.amountOut, recvAsset.dec)} ${recvAsset.ticker}`)}
          {valueRow('At least', `${fmt(q.minAmountOut, recvAsset.dec)} ${recvAsset.ticker}`, true)}
          <div
            className="flex flex-col gap-1.5 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: 'rgba(23,25,30,0.6)', border: CARD_BORDER }}
          >
            <QuoteRow label="Slippage" gray={gray} contrast={contrast}>
              {slippagePct}%
            </QuoteRow>
            <QuoteRow label="Route" gray={gray} contrast={contrast}>
              {q.legs === 1 ? '1 pool' : `up to ${q.legs} pools, one after another`}
            </QuoteRow>
            <QuoteRow label="Fees" gray={gray} contrast={contrast}>
              {bpsToPercentText(feeTotalBps)}% + ~{minerSats(q).toString()} sats
            </QuoteRow>
          </div>
        </div>

        <p className="text-[11px] text-center mt-4 mb-4 px-2" style={{ color: gray }}>
          Anything a pool can&apos;t fill is returned to your wallet automatically.
        </p>

        <div className="flex flex-col gap-2 mt-auto sticky bottom-0 pt-3 pb-1" style={{ background: bg }}>
          <motion.button
            type="button"
            whileTap={starting ? undefined : { scale: 0.97 }}
            disabled={starting}
            onClick={() => void confirmSwap()}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold border-none outline-none cursor-pointer disabled:cursor-not-allowed"
            style={{ background: primaryGradient, color: primaryText, opacity: starting ? 0.6 : 1 }}
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
            {starting ? 'Starting the swap…' : 'Confirm swap'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={starting}
            onClick={() => setScreen('form')}
            className="w-full py-3 rounded-2xl text-[13px] font-semibold outline-none cursor-pointer"
            style={{ background: 'transparent', color: gray, border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </motion.button>
        </div>
      </div>
    );
  };

  // ---- Progress / done -----------------------------------------------------

  const jobAssets = (j: SwapJob): { pay: Asset; recv: Asset } => {
    const t = j.quote.request.token;
    const tok: Asset = {
      ticker: tickerOf(t),
      dec: t.dec,
      icon: (token?.tokenId === t.tokenId ? token.icon : heldById.get(t.tokenId)?.icon) || GENERIC_TOKEN_ICON,
    };
    return j.quote.request.side === 'buy' ? { pay: bsvAsset, recv: tok } : { pay: tok, recv: bsvAsset };
  };

  const stepCircle = (state: 'done' | 'active' | 'pending') => (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: 24,
        height: 24,
        background: state === 'done' ? primaryGradient : 'transparent',
        border: state === 'done' ? 'none' : `2px solid ${state === 'active' ? accent : `${gray}55`}`,
      }}
    >
      {state === 'done' ? (
        <Check size={14} style={{ color: primaryText }} strokeWidth={3} />
      ) : state === 'active' ? (
        <Loader2 size={12} className="animate-spin" style={{ color: accent }} />
      ) : null}
    </div>
  );

  const renderProgress = (j: SwapJob) => {
    const { pay, recv } = jobAssets(j);
    const order = PHASE_ORDER[j.phase];
    const t = j.quote.request.token;
    const reservedDone = order > PHASE_ORDER.staging || (j.phase === 'staging' && !!j.stagedSats);
    const reservedText = j.stagedSats
      ? `Reserved ${fmt(j.stagedSats, BSV_DEC)} BSV${
          j.stagedTokens && safeBig(j.stagedTokens) > 0n ? ` and ${fmt(j.stagedTokens, t.dec)} ${tickerOf(t)}` : ''
        }`
      : 'Reserving funds for the swap';
    const swapActive = j.phase === 'relaying' || j.phase === 'repricing' || j.phase === 'returning';
    const swapDone = j.phase === 'done';
    const swapSub =
      j.phase === 'repricing'
        ? `${j.leg ? shortOutpoint(j.leg) : 'The pool'} changed, getting a fresh price`
        : j.phase === 'returning'
          ? 'Returning what did not fill to your wallet'
          : j.phase === 'relaying'
            ? `Pool ${j.filled.length + 1}`
            : '';
    const showStop = !(j.phase === 'returning' || j.phase === 'done' || j.phase === 'failed');

    return (
      <div className="flex flex-col px-4 flex-1">
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="relative mb-4" style={{ width: 64, height: 64 }}>
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{ border: '3px solid rgba(255,255,255,0.3)', borderTopColor: accent }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <ArrowLeftRight size={24} style={{ color: contrast }} />
            </div>
          </div>
          <h2 className="text-lg font-bold m-0 mb-1" style={{ color: contrast }}>
            Swapping {pay.ticker} for {recv.ticker}
          </h2>
          <p className="text-xs m-0" style={{ color: gray }}>
            Runs in the background. You can close this and check back from Coins.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-xl px-4 py-4" style={{ background: row, border: CARD_BORDER }}>
          <div className="flex items-start gap-3">
            {stepCircle(reservedDone ? 'done' : order >= PHASE_ORDER.staging ? 'active' : 'pending')}
            <span className="text-sm pt-0.5" style={{ color: contrast }}>
              {reservedText}
            </span>
          </div>

          <div className="flex items-start gap-3">
            {stepCircle(swapDone ? 'done' : swapActive ? 'active' : 'pending')}
            <div className="flex flex-col flex-1 min-w-0 pt-0.5">
              <span className="text-sm" style={{ color: contrast }}>
                Swapping with each pool
              </span>
              {swapSub ? (
                <span className="text-[11px]" style={{ color: gray }}>
                  {swapSub}
                </span>
              ) : null}
              {j.filled.length > 0 || (j.leg && (j.phase === 'relaying' || j.phase === 'repricing')) ? (
                <div className="flex flex-col gap-1 mt-2">
                  {j.filled.map((leg, i) => (
                    <div key={`${leg.txid}-${i}`} className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GREEN }} />
                      <span className="font-mono" style={{ color: gray }}>
                        {shortOutpoint(leg.poolOutpoint)}
                      </span>
                      <span className="ml-auto truncate" style={{ color: contrast }}>
                        {fmt(leg.amountIn, pay.dec)} → {fmt(leg.amountOut, recv.dec)}
                      </span>
                    </div>
                  ))}
                  {j.leg && (j.phase === 'relaying' || j.phase === 'repricing') ? (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: AMBER }} />
                      <span className="font-mono" style={{ color: gray }}>
                        {shortOutpoint(j.leg)}
                      </span>
                      <span className="ml-auto" style={{ color: AMBER }}>
                        in flight
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-3">
            {stepCircle(swapDone ? 'done' : 'pending')}
            <span className="text-sm pt-0.5" style={{ color: swapDone ? contrast : gray }}>
              Receive into your wallet
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto sticky bottom-0 pt-3 pb-1" style={{ background: bg }}>
          {outlinedButton('Back to Coins', onBack)}
          {showStop ? (
            <button
              type="button"
              onClick={() => void stopAfterPool()}
              disabled={cancelling}
              className="w-full py-2 text-xs font-semibold bg-transparent border-none outline-none cursor-pointer"
              style={{ color: gray, opacity: cancelling ? 0.5 : 1 }}
            >
              {cancelling ? 'Stopping after this pool…' : 'Stop after this pool'}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderDone = (j: SwapJob) => {
    const { pay, recv } = jobAssets(j);
    const r = j.result;
    const failed = j.phase === 'failed' || r?.status === 'failed';
    const partial = !failed && r?.status === 'partial';
    const title = failed ? 'Swap failed' : partial ? 'Swap partly filled' : 'Swap complete';
    const totalIn = safeBig(r?.totalIn);
    const unfilled = safeBig(r?.unfilled);
    const returned = r?.returned;
    const nLegs = r?.legs.length ?? j.filled.length;

    return (
      <div className="flex flex-col px-4 flex-1">
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div
            className="flex items-center justify-center rounded-full mb-4"
            style={{
              width: 64,
              height: 64,
              background: failed ? 'rgba(255,70,70,0.15)' : primaryGradient,
            }}
          >
            {failed ? (
              <X size={30} style={{ color: red }} strokeWidth={3} />
            ) : (
              <Check size={30} style={{ color: primaryText }} strokeWidth={3} />
            )}
          </div>
          <h2 className="text-lg font-bold m-0 mb-1" style={{ color: contrast }}>
            {title}
          </h2>
          {!failed ? (
            <p className="text-xs m-0" style={{ color: gray }}>
              Your {recv.ticker} is in your wallet.
            </p>
          ) : null}
        </div>

        {failed ? (
          <div
            className="flex flex-col gap-2 rounded-xl px-4 py-3 mb-3"
            style={{ background: 'rgba(255,70,70,0.10)', border: '1px solid rgba(255,70,70,0.35)' }}
          >
            <div className="flex items-start gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: red }} />
              <span className="text-xs" style={{ color: contrast }}>
                {j.error ? swapErrorText(j.errorKind, j.error) : stopText(r?.stop) || 'Nothing was filled.'}
              </span>
            </div>
            {j.recovered ? (
              <span className="text-xs pl-6" style={{ color: gray }}>
                Reserved funds were returned to your wallet.
              </span>
            ) : null}
          </div>
        ) : null}

        {partial ? (
          <div
            className="flex items-start gap-2 rounded-xl px-4 py-3 mb-3"
            style={{ background: 'rgba(247,144,9,0.12)', border: '1px solid rgba(247,144,9,0.35)' }}
          >
            <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: AMBER }} />
            <div className="flex flex-col gap-1 text-xs" style={{ color: contrast }}>
              <span>
                Filled {fmt(totalIn, pay.dec)} of {fmt(totalIn + unfilled, pay.dec)} {pay.ticker}.
                {stopText(r?.stop) ? ` ${stopText(r?.stop)}` : ''}
              </span>
              {returned && 'txid' in returned ? (
                <span>
                  {fmt(unfilled, pay.dec)} {pay.ticker} returned to your wallet.
                </span>
              ) : null}
              {returned && 'error' in returned ? <span>Return failed: {returned.error}</span> : null}
            </div>
          </div>
        ) : null}

        {!failed && r ? (
          <div
            className="flex flex-col gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: row, border: CARD_BORDER }}
          >
            <QuoteRow label="Paid" gray={gray} contrast={contrast}>
              {fmt(r.totalIn, pay.dec)} {pay.ticker}
            </QuoteRow>
            <QuoteRow label="Received" gray={gray} contrast={accent}>
              {fmt(r.totalOut, recv.dec)} {recv.ticker}
            </QuoteRow>
            <QuoteRow label="Through" gray={gray} contrast={contrast}>
              {poolsText(nLegs)}
            </QuoteRow>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 mt-auto sticky bottom-0 pt-3 pb-1" style={{ background: bg }}>
          {primaryButton('Done', onBack)}
          {outlinedButton('Swap again', swapAgain)}
        </div>
      </div>
    );
  };

  // ---- Layout --------------------------------------------------------------

  const slippagePill = (
    <motion.button
      type="button"
      aria-label={`Slippage ${slippagePct}%`}
      aria-expanded={slippageOpen}
      whileTap={{ scale: 0.95 }}
      onClick={() => setSlippageOpen((o) => !o)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full outline-none cursor-pointer"
      style={{ background: row, border: CARD_BORDER }}
    >
      <SlidersHorizontal size={12} style={{ color: gray }} />
      <span className="text-xs font-semibold" style={{ color: contrast }}>
        {slippagePct}%
      </span>
    </motion.button>
  );

  const title =
    screen === 'progress' ? 'Swap in progress' : screen === 'done' ? 'Swap' : pickerOpen ? 'Choose token' : 'Swap';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 35 }}
        className="flex flex-col w-full pt-3 pb-4 overflow-y-auto overflow-x-hidden self-start"
        style={{ height: '100%', backgroundColor: bg }}
      >
        {header(title, screen === 'form' && !pickerOpen ? slippagePill : undefined)}

        {screen === 'form' && !pickerOpen && slippageOpen ? (
          <div className="flex items-center justify-end gap-2 px-4 -mt-2 mb-4">
            <span className="text-[11px] mr-1" style={{ color: gray }}>
              Slippage
            </span>
            {SLIPPAGE_CHOICES.map((pct) => {
              const on = pct === slippagePct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setSlippagePct(pct);
                    setSlippageOpen(false);
                  }}
                  className="px-3 py-1 rounded-full text-xs font-semibold outline-none cursor-pointer"
                  style={{
                    background: on ? primaryGradient : row,
                    color: on ? primaryText : contrast,
                    border: on ? 'none' : CARD_BORDER,
                  }}
                >
                  {pct}%
                </button>
              );
            })}
          </div>
        ) : null}

        {screen === 'form' && (pickerOpen ? renderPicker() : renderForm())}
        {screen === 'confirm' && renderConfirm()}
        {screen === 'progress' && job ? renderProgress(job) : null}
        {screen === 'done' && job ? renderDone(job) : null}
      </motion.div>
    </>
  );
};

const QuoteRow = ({
  label,
  gray,
  contrast,
  children,
}: {
  label: string;
  gray: string;
  contrast: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3">
    <span style={{ color: gray }}>{label}</span>
    <span className="text-right" style={{ color: contrast }}>
      {children}
    </span>
  </div>
);
