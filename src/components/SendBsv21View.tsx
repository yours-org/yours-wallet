import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { ONE_SAT_MARKET_URL } from '../utils/constants';
import { formatNumberWithCommasAndDecimals, normalize, showAmount } from '../utils/format';
import { sleep } from '../utils/sleep';
import { getErrorMessage } from '../utils/tools';
import { BSV21Id } from './BSV21Id';
import { Button } from './Button';
import { Input } from './Input';
import { Show } from './Show';
import { ONESAT_MAINNET_CONTENT_URL, sendBsv21, type Bsv21Balance } from '@1sat/actions';
import { motion } from 'framer-motion';
import { ArrowLeft, ShoppingCart } from 'lucide-react';

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
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const baseUrl = ONESAT_MAINNET_CONTENT_URL;

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    onBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const userSelectedAmount = (inputValue: string, token: Token) => {
    const amtStr = normalize(inputValue, token.info.dec);
    const amt = BigInt(amtStr);
    setTokenSendAmount(amt);
    const total = token.isConfirmed ? token.info.all.confirmed : token.info.all.pending;
    if (amt > total) {
      setTimeout(() => {
        setTokenSendAmount(total);
      }, 500);
    }
  };

  const resetSendState = () => {
    setReceiveAddress('');
    setSuccessTxId('');
    setIsProcessing(false);
    setTokenSendAmount(null);
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

    if (token === null || tokenSendAmount === null) {
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
        address: receiveAddress,
        amount: tokenSendAmount,
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

  return (
    <Show when={token !== null}>
      {token ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 35 }}
          className="flex flex-col w-full h-full overflow-y-auto"
          style={{ backgroundColor: theme.color.global.walletBackground }}
        >
          {/* Header row */}
          <div className="flex items-center px-4 pt-10 pb-4">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                setTokenSendAmount(null);
                resetSendState();
                onBack();
              }}
              className="flex items-center justify-center w-8 h-8 rounded-full outline-none border-none cursor-pointer flex-shrink-0 mr-3"
              style={{ backgroundColor: theme.color.global.row }}
            >
              <ArrowLeft size={16} style={{ color: theme.color.global.contrast }} />
            </motion.button>
            <span className="text-base font-bold" style={{ color: theme.color.global.contrast }}>
              Send {getTokenName(token.info)}
            </span>
          </div>

          {/* Token identity card */}
          <div
            className="mx-4 mb-3 rounded-2xl px-4 py-4 flex items-center gap-4"
            style={{
              backgroundColor: theme.color.global.row,
              border: `1px solid ${theme.color.global.gray}14`,
            }}
          >
            <Show when={!!token.info.icon && token.info.icon.length > 0}>
              <img
                src={`${baseUrl}/${token.info.icon}`}
                alt={getTokenName(token.info)}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
            </Show>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold truncate" style={{ color: theme.color.global.contrast }}>
                {getTokenName(token.info)}
              </span>
              {/* Balance as MAX chip */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => userSelectedAmount(String(Number(token.info.all.confirmed)), token)}
                className="mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-lg border-none outline-none cursor-pointer w-fit"
                style={{
                  background: `${theme.color.component.primaryButtonLeftGradient}20`,
                  color: theme.color.component.primaryButtonLeftGradient,
                }}
              >
                MAX{' '}
                {formatNumberWithCommasAndDecimals(
                  Number(showAmount(token.info.all.confirmed, token.info.dec)),
                  token.info.dec,
                )}
              </motion.button>
            </div>
          </div>

          {/* Token ID */}
          <div
            className="mx-4 mb-3 rounded-2xl px-2 py-2 flex items-center justify-center"
            style={{
              backgroundColor: theme.color.global.row,
              border: `1px solid ${theme.color.global.gray}14`,
            }}
          >
            <BSV21Id
              theme={theme}
              id={token.info.id}
              onCopyTokenId={() => {
                addSnackbar('Copied', 'success');
              }}
            />
          </div>

          {/* Send form */}
          <form noValidate onSubmit={(e) => handleSendBSV21(e)} className="flex flex-col w-full px-0">
            {/* Address */}
            <div
              className="mx-4 mb-3 rounded-2xl overflow-hidden"
              style={{
                backgroundColor: theme.color.global.row,
                border: `1px solid ${theme.color.global.gray}14`,
              }}
            >
              <div className="px-4 pt-3 pb-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: theme.color.global.gray }}
                >
                  Recipient Address
                </span>
              </div>
              <Input
                theme={theme}
                name="address"
                placeholder="Enter address..."
                type="text"
                onChange={(e) => setReceiveAddress(e.target.value)}
                value={receiveAddress}
              />
            </div>

            {/* Amount */}
            <div
              className="mx-4 mb-4 rounded-2xl overflow-hidden"
              style={{
                backgroundColor: theme.color.global.row,
                border: `1px solid ${theme.color.global.gray}14`,
              }}
            >
              <div className="px-4 pt-3 pb-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: theme.color.global.gray }}
                >
                  Token Amount
                </span>
              </div>
              <Input
                name="amt"
                theme={theme}
                placeholder="0"
                type="number"
                step={'1'}
                value={tokenSendAmount !== null ? showAmount(tokenSendAmount, token.info.dec) : ''}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue === '') {
                    setTokenSendAmount(null);
                  } else {
                    userSelectedAmount(inputValue, token);
                  }
                }}
              />
            </div>

            {/* Send button */}
            <Button
              theme={theme}
              type="primary"
              label={isProcessing ? 'Sending...' : `Send ${getTokenName(token.info)}`}
              disabled={isProcessing}
              loading={isProcessing}
              isSubmit
            />
          </form>

          {/* Trade button */}
          <div className="flex justify-center w-full mt-1 mb-1">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => window.open(`${ONE_SAT_MARKET_URL}/bsv21/${token.info.id}`, '_blank')}
              className="flex items-center gap-2 w-[87%] h-9 justify-center rounded-xl text-sm font-bold outline-none border cursor-pointer"
              style={{
                backgroundColor: theme.color.global.walletBackground,
                borderColor: theme.color.global.gray + '40',
                color: theme.color.global.contrast,
              }}
            >
              <ShoppingCart size={14} />
              Trade
            </motion.button>
          </div>

          <Button
            theme={theme}
            type="secondary"
            label="Cancel"
            disabled={isProcessing}
            onClick={() => {
              setTokenSendAmount(null);
              resetSendState();
              onBack();
            }}
          />
        </motion.div>
      ) : (
        <></>
      )}
    </Show>
  );
};
