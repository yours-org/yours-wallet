import validate from 'bitcoin-address-validation';
import { useEffect, useRef, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { ONE_SAT_MARKET_URL } from '../utils/constants';
import { showAmount, normalize, truncate } from '../utils/format';
import { sleep } from '../utils/sleep';
import { getErrorMessage } from '../utils/tools';
import { Input } from './Input';
import { Show } from './Show';
import { CoinHistory } from './CoinHistory';
import { ONESAT_MAINNET_CONTENT_URL, sendBsv21, type Bsv21Balance } from '@1sat/actions';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ShoppingCart, Send, Copy, Check, Plus, Trash2 } from 'lucide-react';

export interface Token {
  isConfirmed: boolean;
  info: Bsv21Balance;
}

export type SendBsv21ViewProps = {
  token: Token;
  /**
   * Called when the user exits the view. If the exit was triggered by a
   * successful send, `sentAtomic` is the total atomic token amount sent so
   * the parent can optimistically adjust its cached balance. Omitted on a
   * manual back press.
   */
  onBack: (sentAtomic?: bigint) => void | Promise<void>;
};

type Bsv21Recipient = {
  id: string;
  address: string;
  amountInput: string;
};

const newRecipient = (): Bsv21Recipient => ({
  id: crypto.randomUUID(),
  address: '',
  amountInput: '',
});

export const SendBsv21View = ({ token, onBack }: SendBsv21ViewProps) => {
  const { apiContext } = useServiceContext();
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const getTokenName = (b: { sym?: string }): string => b.sym || 'Null';
  const [recipients, setRecipients] = useState<Bsv21Recipient[]>([newRecipient()]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successTxId, setSuccessTxId] = useState('');
  const sentAtomicRef = useRef<bigint>(0n);
  const [copied, setCopied] = useState(false);
  const baseUrl = ONESAT_MAINNET_CONTENT_URL;

  const maxAmount = token.isConfirmed ? token.info.all.confirmed : token.info.all.pending;
  const maxDisplay = showAmount(maxAmount, token.info.dec);

  useEffect(() => {
    if (!successTxId) return;
    // Reset local form state first, then exit. Parent does an optimistic balance
    // update based on `sentAtomicRef.current` so the transition is instant.
    resetSendState();
    void onBack(sentAtomicRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const toAtomic = (input: string): bigint | null => {
    if (!input || input === '.' || input === '0.') return null;
    try {
      return BigInt(normalize(input, token.info.dec));
    } catch {
      return null;
    }
  };

  const addRecipient = () => setRecipients((prev) => [...prev, newRecipient()]);
  const removeRecipient = (id: string) =>
    setRecipients((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const updateRecipient = (id: string, field: 'address' | 'amountInput', value: string) => {
    if (field === 'amountInput') {
      if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
      const dec = token.info.dec;
      const parts = value.split('.');
      if (parts.length === 2 && dec > 0 && parts[1].length > dec) return;
      if (parts.length === 2 && dec === 0) return;
    }
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  /** Fill the given recipient with (max available - amounts already assigned to others). */
  const handleSetMax = (id: string) => {
    const assignedElsewhere = recipients.reduce(
      (acc, r) => (r.id === id ? acc : acc + (toAtomic(r.amountInput) ?? 0n)),
      0n,
    );
    const available = maxAmount > assignedElsewhere ? maxAmount - assignedElsewhere : 0n;
    updateRecipient(id, 'amountInput', showAmount(available, token.info.dec));
  };

  const handleCopyId = () => {
    if (!token.info.id) return;
    navigator.clipboard.writeText(token.info.id);
    setCopied(true);
    addSnackbar('Token ID copied', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const resetSendState = () => {
    setRecipients([newRecipient()]);
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const handleSendBSV21 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    // Validate each recipient and build the action input
    const sendRecipients: { address: string; amount: bigint }[] = [];
    let total = 0n;

    for (const r of recipients) {
      if (!validate(r.address)) {
        addSnackbar('All recipients must have a valid 1Sat Ordinal address.', 'info');
        setIsProcessing(false);
        return;
      }
      const atomic = toAtomic(r.amountInput);
      if (atomic === null || atomic <= 0n) {
        addSnackbar('All recipients must have a valid amount.', 'info');
        setIsProcessing(false);
        return;
      }
      sendRecipients.push({ address: r.address, amount: atomic });
      total += atomic;
    }

    if (total > maxAmount) {
      addSnackbar('Total amount exceeds available balance.', 'error');
      setIsProcessing(false);
      return;
    }

    if (!token.info.id) {
      addSnackbar('Missing token ID!', 'error');
      setIsProcessing(false);
      return;
    }

    let sendRes: Awaited<ReturnType<typeof sendBsv21.execute>>;
    try {
      sendRes = await sendBsv21.execute(apiContext, {
        tokenId: token.info.id,
        recipients: sendRecipients,
      });
    } catch (error) {
      console.error('[SendBsv21View] sendBsv21.execute threw:', error);
      setIsProcessing(false);
      addSnackbar(getErrorMessage(undefined), 'error');
      return;
    }

    if (!sendRes.txid || sendRes.error) {
      console.error('[SendBsv21View] sendBsv21 error:', sendRes.error);
      setIsProcessing(false);
      addSnackbar(getErrorMessage(sendRes.error), 'error');
      return;
    }

    // Stash the total sent so the parent can optimistically decrement its
    // cached token balance without waiting on the overlay to catch up.
    sentAtomicRef.current = total;
    setSuccessTxId(sendRes.txid);
    addSnackbar('Tokens Sent!', 'success');
  };

  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const tokenName = getTokenName(token.info);

  const anyRecipientEmpty = recipients.some((r) => !r.address || !r.amountInput);
  const submitDisabled = isProcessing || anyRecipientEmpty;

  return (
    <Show when={token !== null}>
      {token ? (
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
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                resetSendState();
                onBack();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
              style={{ backgroundColor: '#17191E' }}
            >
              <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
            </motion.button>
            <span className="text-base font-bold" style={{ color: contrast }}>
              Send {tokenName}
            </span>
          </div>

          {/* Balance chip — matches the BSV / MNEE send views */}
          <div className="flex flex-col items-center w-full mb-5 gap-1.5">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: row }}>
              <Show when={!!token.info.icon && token.info.icon.length > 0}>
                <img
                  src={`${baseUrl}/${token.info.icon}`}
                  alt={tokenName}
                  className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                />
              </Show>
              <span className="text-xs" style={{ color: gray }}>
                Balance
              </span>
              <span className="text-sm font-semibold font-mono" style={{ color: contrast }}>
                {maxDisplay}
              </span>
              <span className="text-xs font-semibold" style={{ color: accent }}>
                {tokenName}
              </span>
            </div>

            {/* Token ID copy chip */}
            <Show when={!!token.info.id}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCopyId}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border-0 outline-none cursor-pointer"
                style={{ background: `${gray}12` }}
                title="Copy token ID"
              >
                {copied ? <Check size={10} style={{ color: accent }} /> : <Copy size={10} style={{ color: gray }} />}
                <span className="text-[10px] font-mono" style={{ color: gray }}>
                  {truncate(token.info.id, 8, 6)}
                </span>
              </motion.button>
            </Show>
          </div>

          {/* Send form */}
          <form noValidate onSubmit={(e) => handleSendBSV21(e)} className="flex flex-col w-full px-4 gap-3">
            {/* Recipient cards */}
            <AnimatePresence>
              {recipients.map((recipient, idx) => (
                <motion.div
                  key={recipient.id}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="w-full rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: row }}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: gray }}>
                      {recipients.length > 1 ? `Recipient ${idx + 1}` : 'Recipient'}
                    </span>
                    {recipients.length > 1 && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={() => removeRecipient(recipient.id)}
                        className="flex items-center justify-center w-6 h-6 rounded-full border-0 outline-none cursor-pointer"
                        style={{ background: '#ff444415', color: '#ff4444' }}
                      >
                        <Trash2 size={12} />
                      </motion.button>
                    )}
                  </div>

                  {/* Address input */}
                  <Input
                    theme={theme}
                    placeholder="Enter address..."
                    type="text"
                    onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                    value={recipient.address}
                    style={{ width: '100%', margin: 0 }}
                  />

                  {/* Amount + MAX */}
                  <div
                    className="flex items-center w-full rounded-xl border"
                    style={{ backgroundColor: row, borderColor: gray + '40' }}
                  >
                    <input
                      placeholder="0"
                      type="text"
                      inputMode="decimal"
                      className="flex-1 bg-transparent h-9 px-4 text-sm outline-none border-none"
                      style={{
                        color: contrast,
                        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
                      }}
                      value={recipient.amountInput}
                      onChange={(e) => updateRecipient(recipient.id, 'amountInput', e.target.value)}
                    />
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.93 }}
                      onClick={() => handleSetMax(recipient.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 mr-1.5 rounded-lg border-0 outline-none cursor-pointer shrink-0"
                      style={{ background: `${accent}18` }}
                      title="Fill with remaining available amount"
                    >
                      <span className="text-[11px] font-bold" style={{ color: accent }}>
                        MAX
                      </span>
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add recipient */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={addRecipient}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-0 outline-none cursor-pointer"
              style={{
                background: `${accent}10`,
                border: `1px dashed ${accent}40`,
              }}
            >
              <Plus size={14} style={{ color: accent }} />
              <span className="text-sm font-semibold" style={{ color: accent }}>
                Add Recipient
              </span>
            </motion.button>

            {/* Action buttons */}
            <div className="flex gap-2 mt-1">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => window.open(`${ONE_SAT_MARKET_URL}/bsv21/${token.info.id}`, '_blank')}
                className="flex items-center justify-center gap-2 flex-1 h-11 rounded-xl text-sm font-bold outline-none border cursor-pointer"
                style={{
                  backgroundColor: theme.color.global.walletBackground,
                  borderColor: gray + '40',
                  color: contrast,
                }}
              >
                <ShoppingCart size={14} />
                Trade
              </motion.button>
              <motion.button
                whileHover={!submitDisabled ? { scale: 1.02 } : undefined}
                whileTap={!submitDisabled ? { scale: 0.98 } : undefined}
                type="submit"
                disabled={submitDisabled}
                className="flex items-center justify-center gap-2 flex-1 h-11 rounded-xl text-sm font-bold outline-none border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accentRight})`,
                  color: theme.color.component.primaryButtonText,
                }}
              >
                <Send size={14} />
                {isProcessing ? 'Sending...' : 'Send'}
              </motion.button>
            </div>
          </form>

          <Show when={!!token.info.id}>
            <div className="w-full px-4">
              <CoinHistory
                filter={{
                  type: 'bsv21',
                  tokenId: token.info.id!,
                  decimals: token.info.dec,
                  symbol: token.info.sym,
                }}
                refreshKey={successTxId}
              />
            </div>
          </Show>
        </motion.div>
      ) : (
        <></>
      )}
    </Show>
  );
};
