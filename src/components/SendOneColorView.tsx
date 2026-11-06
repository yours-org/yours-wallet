import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, AtSign, Check, Copy, Send } from 'lucide-react';
import { send1Color } from '@1sat/actions';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { normalizeHandle, oneColorTicker, type OneColorBalance } from '../services/oneColor';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { displayAmount, formatTokenAmount, normalize, showAmount, truncate } from '../utils/format';
import { getErrorMessage } from '../utils/tools';
import { Input } from './Input';
import { SendConfirmation, type SendLineItem } from './SendConfirmation';
import { Show } from './Show';

export type SendOneColorViewProps = {
  token: OneColorBalance;
  /** Called on exit; `sentAtomic` is the amount sent when the exit follows a successful send. */
  onBack: (sentAtomic?: bigint) => void | Promise<void>;
};

/**
 * Send 1Color tokens to a BRC-169 handle. The wallet's color module builds a
 * BRC-177 handoff and this wallet delivers it to the handle's mailbox; the
 * recipient's wallet submits it when it next syncs. A handle is the only
 * destination a 1Color send takes.
 */
export const SendOneColorView = ({ token, onBack }: SendOneColorViewProps) => {
  const { apiContext } = useServiceContext();
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [handleInput, setHandleInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState<{
    lineItems: SendLineItem[];
    total: string;
    onConfirm: () => void;
  } | null>(null);
  const [successTxId, setSuccessTxId] = useState('');
  const [copied, setCopied] = useState(false);
  const sentAtomicRef = useRef<bigint>(0n);

  const ticker = oneColorTicker(token);
  const maxAmount = token.available;

  useEffect(() => {
    if (!successTxId) return;
    void onBack(sentAtomicRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const toAtomic = (input: string): bigint | null => {
    if (!input || input === '.' || input === '0.') return null;
    try {
      return BigInt(normalize(input, token.dec));
    } catch {
      return null;
    }
  };

  const updateAmount = (value: string) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    const parts = value.split('.');
    if (parts.length === 2 && token.dec > 0 && parts[1].length > token.dec) return;
    if (parts.length === 2 && token.dec === 0) return;
    setAmountInput(value);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(token.assetId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const handle = normalizeHandle(handleInput);
    if (!handle) {
      addSnackbar('Enter a handle like @name@domain.', 'info');
      return;
    }
    const atomic = toAtomic(amountInput);
    if (atomic === null || atomic <= 0n) {
      addSnackbar('Enter a valid amount.', 'info');
      return;
    }
    if (atomic > maxAmount) {
      addSnackbar('Amount exceeds available balance.', 'error');
      return;
    }
    const amountText = `${formatTokenAmount(atomic, token.dec)} ${ticker}`;
    setSendConfirmation({
      lineItems: [{ address: handle, amount: amountText }],
      total: amountText,
      onConfirm: async () => {
        setSendConfirmation(null);
        setIsProcessing(true);
        await runSend(handle, atomic);
      },
    });
  };

  const runSend = async (handle: string, amount: bigint) => {
    let res: Awaited<ReturnType<typeof send1Color.execute>>;
    try {
      res = await send1Color.execute(apiContext, {
        assetId: token.assetId,
        amount: amount.toString(),
        destination: { handle },
      });
    } catch (error) {
      console.error('[SendOneColorView] send1Color threw:', error);
      setIsProcessing(false);
      addSnackbar(getErrorMessage(error), 'error');
      return;
    }
    if (res.error) {
      console.error('[SendOneColorView] send1Color error:', res.error);
      setIsProcessing(false);
      if (res.txid) {
        // The handoff exists but never reached the mailbox: the tokens stay pending until it is settled or expires.
        addSnackbar(`Built, but not delivered to ${handle}: ${getErrorMessage(res.error)}`, 'error', 6000);
      } else {
        addSnackbar(getErrorMessage(res.error), 'error');
      }
      return;
    }
    sentAtomicRef.current = amount;
    setSuccessTxId(res.txid ?? 'sent');
    addSnackbar(`Sent to ${handle}. They receive it when their wallet next syncs.`, 'success', 4000);
  };

  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const submitDisabled = isProcessing || !handleInput || !amountInput;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 35 }}
        className="flex flex-col w-full pt-14 pb-20 overflow-y-auto overflow-x-hidden self-start"
        style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 mb-5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onBack()}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
            style={{ backgroundColor: '#17191E' }}
          >
            <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
          </motion.button>
          <span className="text-base font-bold" style={{ color: contrast }}>
            Send {ticker}
          </span>
        </div>

        {/* Balance chip, as the BSV21 send view shows it */}
        <div className="flex flex-col items-center w-full mb-5 gap-1.5">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: row }}>
            <img
              src={token.icon || GENERIC_TOKEN_ICON}
              alt={ticker}
              className="w-4 h-4 rounded-full object-cover flex-shrink-0"
            />
            <span className="text-xs" style={{ color: gray }}>
              Available
            </span>
            <span className="text-sm font-semibold font-mono" style={{ color: contrast }}>
              {displayAmount(maxAmount, token.dec)}
            </span>
            <span className="text-xs font-semibold" style={{ color: accent }}>
              {ticker}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCopyId}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border-0 outline-none cursor-pointer"
              style={{ background: `${gray}12` }}
              title="Copy asset ID"
            >
              {copied ? <Check size={10} style={{ color: accent }} /> : <Copy size={10} style={{ color: gray }} />}
              <span className="text-[10px] font-mono" style={{ color: gray }}>
                {truncate(token.assetId, 8, 6)}
              </span>
            </motion.button>
            <Show when={token.pending > 0n}>
              <div
                className="px-2.5 py-1 rounded-full"
                style={{ background: `${gray}12` }}
                title="Held by a send that has not settled yet"
              >
                <span className="text-[10px] font-semibold" style={{ color: gray }}>
                  {displayAmount(token.pending, token.dec)} pending
                </span>
              </div>
            </Show>
          </div>
        </div>

        {/* Send form */}
        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="flex flex-col w-full px-4 gap-3">
          <AnimatePresence>
            <motion.div
              key="recipient"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: row }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: gray }}>
                Recipient handle
              </span>
              <div className="relative w-full">
                <AtSign
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: gray }}
                />
                <Input
                  theme={theme}
                  placeholder="name@domain"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setHandleInput(e.target.value)}
                  value={handleInput}
                  style={{ width: '100%', margin: 0, paddingLeft: '2rem' }}
                />
              </div>

              <div
                className="flex items-center w-full rounded-xl border"
                style={{ backgroundColor: row, borderColor: gray + '40' }}
              >
                <input
                  placeholder="0"
                  type="text"
                  inputMode="decimal"
                  className="flex-1 bg-transparent h-9 px-4 text-sm outline-none border-none"
                  style={{ color: contrast, fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
                  value={amountInput}
                  onChange={(e) => updateAmount(e.target.value)}
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setAmountInput(showAmount(maxAmount, token.dec))}
                  className="flex items-center gap-1 px-2.5 py-1.5 mr-1.5 rounded-lg border-0 outline-none cursor-pointer shrink-0"
                  style={{ background: `${accent}18` }}
                  title="Fill with the available amount"
                >
                  <span className="text-[11px] font-bold" style={{ color: accent }}>
                    MAX
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col gap-0.5 px-2">
            <p className="text-[10px] text-center" style={{ color: gray }}>
              Delivered to the handle's mailbox and claimed when their wallet next syncs.
            </p>
            <p className="text-[10px] text-center" style={{ color: gray }}>
              Sending 1Color tokens to a plain address is coming; for now a handle is the destination.
            </p>
          </div>

          <motion.button
            whileHover={!submitDisabled ? { scale: 1.02 } : undefined}
            whileTap={!submitDisabled ? { scale: 0.98 } : undefined}
            type="submit"
            disabled={submitDisabled}
            className="flex items-center justify-center gap-2 w-full py-3 mt-1 rounded-2xl text-[14px] font-semibold outline-none border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accentRight})`,
              color: theme.color.component.primaryButtonText,
            }}
          >
            <Send size={14} />
            {isProcessing ? 'Sending...' : 'Send'}
          </motion.button>
        </form>
      </motion.div>
      <SendConfirmation
        show={!!sendConfirmation}
        theme={theme}
        icon={token.icon || GENERIC_TOKEN_ICON}
        lineItems={sendConfirmation?.lineItems ?? []}
        total={sendConfirmation?.total}
        isProcessing={isProcessing}
        onConfirm={() => sendConfirmation?.onConfirm()}
        onCancel={() => setSendConfirmation(null)}
      />
    </>
  );
};
