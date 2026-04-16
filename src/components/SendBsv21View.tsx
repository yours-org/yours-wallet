import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { ONE_SAT_MARKET_URL } from '../utils/constants';
import { showAmount, normalize, truncate } from '../utils/format';
import { sleep } from '../utils/sleep';
import { getErrorMessage } from '../utils/tools';
import { Input } from './Input';
import { Show } from './Show';
import { ONESAT_MAINNET_CONTENT_URL, sendBsv21, type Bsv21Balance } from '@1sat/actions';
import { motion } from 'framer-motion';
import { ArrowLeft, ShoppingCart, Send, Copy, Check } from 'lucide-react';

export interface Token {
  isConfirmed: boolean;
  info: Bsv21Balance;
}

export type SendBsv21ViewProps = {
  token: Token;
  onBack: () => void;
};

export const SendBsv21View = ({ token, onBack }: SendBsv21ViewProps) => {
  const { apiContext } = useServiceContext();
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const getTokenName = (b: { sym?: string }): string => b.sym || 'Null';
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const [copied, setCopied] = useState(false);
  const baseUrl = ONESAT_MAINNET_CONTENT_URL;

  const maxAmount = token.isConfirmed ? token.info.all.confirmed : token.info.all.pending;
  const maxDisplay = showAmount(maxAmount, token.info.dec);

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    onBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const getAtomicAmount = (): bigint | null => {
    if (!amountInput || amountInput === '.' || amountInput === '0.') return null;
    try {
      return BigInt(normalize(amountInput, token.info.dec));
    } catch {
      return null;
    }
  };

  const handleAmountChange = (value: string) => {
    if (value === '') {
      setAmountInput('');
      return;
    }
    if (!/^\d*\.?\d*$/.test(value)) return;
    const dec = token.info.dec;
    const parts = value.split('.');
    if (parts.length === 2 && dec > 0 && parts[1].length > dec) return;
    if (parts.length === 2 && dec === 0) return;
    setAmountInput(value);
  };

  const handleSetMax = () => {
    setAmountInput(maxDisplay);
  };

  const handleCopyId = () => {
    if (!token.info.id) return;
    navigator.clipboard.writeText(token.info.id);
    setCopied(true);
    addSnackbar('Token ID copied', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const resetSendState = () => {
    setReceiveAddress('');
    setSuccessTxId('');
    setIsProcessing(false);
    setAmountInput('');
  };

  const handleSendBSV21 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!validate(receiveAddress)) {
      addSnackbar('You must enter a valid 1Sat Ordinal address.', 'info');
      setIsProcessing(false);
      return;
    }

    const atomicAmount = getAtomicAmount();
    if (token === null || atomicAmount === null || atomicAmount <= 0n) {
      addSnackbar('Please enter a valid amount.', 'info');
      setIsProcessing(false);
      return;
    }

    if (atomicAmount > maxAmount) {
      addSnackbar('Amount exceeds available balance.', 'error');
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
        recipients: [{ address: receiveAddress, amount: atomicAmount }],
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

    setSuccessTxId(sendRes.txid);
    addSnackbar('Tokens Sent!', 'success');
  };

  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const tokenName = getTokenName(token.info);

  return (
    <Show when={token !== null}>
      {token ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 35 }}
          className="flex flex-col w-full h-full overflow-y-auto pb-20"
          style={{ backgroundColor: theme.color.global.walletBackground }}
        >
          {/* Header */}
          <div className="flex items-center px-4 pt-10 pb-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                resetSendState();
                onBack();
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg outline-none border-none cursor-pointer flex-shrink-0 mr-3"
              style={{ backgroundColor: row }}
            >
              <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
            </motion.button>
            <span className="text-base font-bold" style={{ color: contrast }}>
              Send {tokenName}
            </span>
          </div>

          {/* Token hero card */}
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ backgroundColor: row }}>
            {/* Top section: icon + name + balance */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <Show when={!!token.info.icon && token.info.icon.length > 0}>
                <img
                  src={`${baseUrl}/${token.info.icon}`}
                  alt={tokenName}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  style={{ border: `2px solid ${accent}30` }}
                />
              </Show>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-base font-bold truncate" style={{ color: contrast }}>
                  {tokenName}
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-bold" style={{ color: contrast }}>
                    {maxDisplay}
                  </span>
                  <span className="text-xs" style={{ color: gray }}>
                    available
                  </span>
                </div>
              </div>
            </div>

            {/* Token ID row */}
            <Show when={!!token.info.id}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleCopyId}
                className="flex items-center gap-2 w-full px-4 py-2.5 border-0 outline-none cursor-pointer"
                style={{ background: `${gray}0a`, borderTop: `1px solid ${gray}15` }}
              >
                {copied ? <Check size={12} style={{ color: accent }} /> : <Copy size={12} style={{ color: gray }} />}
                <span className="text-xs font-mono" style={{ color: gray }}>
                  {truncate(token.info.id, 8, 6)}
                </span>
              </motion.button>
            </Show>
          </div>

          {/* Send form */}
          <form noValidate onSubmit={(e) => handleSendBSV21(e)} className="flex flex-col w-full px-4 gap-3">
            {/* Address field */}
            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1"
                style={{ color: gray }}
              >
                Recipient Address
              </label>
              <Input
                theme={theme}
                name="address"
                placeholder="Enter address..."
                type="text"
                onChange={(e) => setReceiveAddress(e.target.value)}
                value={receiveAddress}
                style={{ width: '100%', margin: 0 }}
              />
            </div>

            {/* Amount field */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: gray }}>
                  Amount
                </label>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSetMax}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border-none outline-none cursor-pointer"
                  style={{ background: `${accent}20`, color: accent }}
                >
                  MAX
                </motion.button>
              </div>
              <Input
                name="amt"
                theme={theme}
                placeholder="0"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                style={{ width: '100%', margin: 0 }}
              />
            </div>

            {/* Action buttons — same size, side by side */}
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
                whileHover={!isProcessing && amountInput && receiveAddress ? { scale: 1.02 } : undefined}
                whileTap={!isProcessing && amountInput && receiveAddress ? { scale: 0.98 } : undefined}
                type="submit"
                disabled={isProcessing || !amountInput || !receiveAddress}
                className="flex items-center justify-center gap-2 flex-1 h-11 rounded-xl text-sm font-bold outline-none border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accentRight})`,
                  color: '#FFFFFF',
                }}
              >
                <Send size={14} />
                {isProcessing ? 'Sending...' : `Send`}
              </motion.button>
            </div>
          </form>
        </motion.div>
      ) : (
        <></>
      )}
    </Show>
  );
};
