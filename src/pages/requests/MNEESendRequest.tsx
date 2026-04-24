import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { validate } from 'bitcoin-address-validation';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { formatNumberWithCommasAndDecimals, truncate } from '../../utils/format';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { SendMNEE } from '../../services/types/provider.types';
import { useServiceContext } from '../../hooks/useServiceContext';
import { getErrorMessage } from '../../utils/tools';
import { MNEE_DECIMALS, MNEE_ICON_URL } from '../../utils/constants';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { sendMnee, deriveDepositAddresses, getMneeBalance } from '@1sat/actions';

const YOURS_PREFIX = 'yours';
const YOURS_ADDRESS_COUNT = 5;

export type MNEESendRequestProps = {
  request: SendMNEE[];
  popupId: number | undefined;
  onResponse: () => void;
};

export const MNEESendRequest = (props: MNEESendRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, apiContext } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const processMNEESend = async () => {
    try {
      for (const req of request) {
        if (req.address && !validate(req.address)) {
          addSnackbar('Found an invalid receive address.', 'error');
          return;
        }
        if (!req.amount || req.amount <= 0) {
          addSnackbar('Found an invalid amount.', 'error');
          return;
        }
      }

      if (!apiContext) {
        addSnackbar('Wallet not ready.', 'error');
        return;
      }

      const derivationResult = await deriveDepositAddresses.execute(apiContext, {
        prefix: YOURS_PREFIX,
        startIndex: 0,
        count: YOURS_ADDRESS_COUNT,
      });

      // Check balance before sending
      const totalRequested = request.reduce((sum, r) => sum + r.amount, 0);
      const derivedAddresses = derivationResult.derivations.map((d) => d.address);
      const balanceRes = await getMneeBalance.execute(apiContext, { addresses: derivedAddresses });
      if (totalRequested > balanceRes.totalDecimal) {
        addSnackbar('Insufficient MNEE balance!', 'error');
        setIsProcessing(false);
        return;
      }

      addSnackbar('Transaction initiated. Processing...', 'info');

      const sendRes = await sendMnee.execute(apiContext, {
        recipients: request.map((r) => ({ address: r.address, amount: r.amount })),
        derivations: derivationResult.derivations,
      });

      if (sendRes.error) {
        if (sendRes.error === 'timeout-waiting-for-txid') {
          addSnackbar('Transaction timeout. Please check your transaction history.', 'error');
        } else {
          addSnackbar(`Transaction failed: ${sendRes.error}`, 'error');
        }
        setIsProcessing(false);
        return;
      }

      addSnackbar('Transaction Successful!', 'success');

      const addresses = derivationResult.derivations.map((d) => d.address);
      try {
        const balanceRes = await getMneeBalance.execute(apiContext, { addresses });
        const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
        if (account && selectedAccount) {
          const key: keyof ChromeStorageObject = 'accounts';
          const update: Partial<ChromeStorageObject['accounts']> = {
            [selectedAccount]: {
              ...account,
              mneeBalance: {
                amount: balanceRes.totalAtomic,
                decimalAmount: balanceRes.totalDecimal,
              },
            },
          };
          await chromeStorageService.updateNested(key, update);
        }
      } catch {
        // Balance update is best-effort
      }

      onResponse();

      sendMessage({
        action: 'sendMNEEResponse',
        txid: sendRes.txid,
      });
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 423')) {
        addSnackbar('The sending or receiving address may be frozen. Please contact support.', 'error');
      } else {
        addSnackbar(getErrorMessage(errorMessage) || 'Transfer failed. Please try again.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSelect, hideMenu]);

  const handleSendMNEE = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    processMNEESend();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'sendMNEEResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('sendMNEERequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const totalAmount = request.reduce((acc, req) => acc + req.amount, 0);

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending MNEE..." />
      </Show>

      <Show when={!isProcessing && !!request}>
        <motion.div
          className="flex flex-col items-center w-full px-4 pt-6 pb-4 overflow-y-auto"
          style={{ maxHeight: '100vh' }}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        >
          {/* MNEE icon */}
          <motion.img
            src={MNEE_ICON_URL}
            alt="MNEE"
            className="w-16 h-16 rounded-full mb-4"
            style={{ border: '2px solid rgba(255,255,255,0.08)' }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, type: 'spring', damping: 20, stiffness: 300 }}
          />

          {/* Title */}
          <h1 className="text-lg font-bold mb-1" style={{ color: theme.color.global.contrast }}>
            Send MNEE
          </h1>

          {/* Amount */}
          <p className="text-3xl font-bold mb-1" style={{ color: '#A1FF8B' }}>
            {formatNumberWithCommasAndDecimals(totalAmount, MNEE_DECIMALS)}
          </p>
          <p className="text-sm mb-5" style={{ color: theme.color.global.gray }}>
            MNEE
          </p>

          {/* Recipient info */}
          <motion.div
            className="w-full rounded-2xl px-4 py-3 mb-4"
            style={{ background: theme.color.global.row, border: '1px solid rgba(255,255,255,0.06)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {request.length === 1 ? (
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold" style={{ color: theme.color.global.gray }}>
                  Recipient
                </span>
                <span className="text-xs font-mono" style={{ color: theme.color.global.contrast }}>
                  {truncate(request[0].address, 8, 8)}
                </span>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold mb-2" style={{ color: theme.color.global.gray }}>
                  {request.length} Recipients
                </p>
                {request.map((r, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center py-1.5"
                    style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                  >
                    <span className="text-xs font-mono" style={{ color: theme.color.global.contrast }}>
                      {truncate(r.address, 6, 6)}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: '#A1FF8B' }}>
                      {formatNumberWithCommasAndDecimals(r.amount, MNEE_DECIMALS)} MNEE
                    </span>
                  </div>
                ))}
              </>
            )}
          </motion.div>

          {/* Warning */}
          <motion.div
            className="w-full flex items-start gap-2 rounded-xl px-3 py-2.5 mb-5"
            style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.15)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.14 }}
          >
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f5a623' }} />
            <p className="text-xs leading-relaxed" style={{ color: '#f5a623' }}>
              Double check all details before sending. This action cannot be undone.
            </p>
          </motion.div>

          {/* Actions */}
          <form noValidate onSubmit={(e) => handleSendMNEE(e)} className="w-full flex flex-col gap-3">
            <motion.button
              type="submit"
              className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #A1FF8B 0%, #34D399 100%)',
                color: '#010101',
                opacity: isProcessing ? 0.6 : 1,
              }}
              disabled={isProcessing}
              whileHover={{ scale: isProcessing ? 1 : 1.02 }}
              whileTap={{ scale: isProcessing ? 1 : 0.97 }}
              transition={{ type: 'spring', damping: 20, stiffness: 400 }}
            >
              {isProcessing && <Loader2 size={14} className="animate-spin" />}
              Approve {formatNumberWithCommasAndDecimals(totalAmount, MNEE_DECIMALS)} MNEE
            </motion.button>

            <motion.button
              type="button"
              className="w-full py-3.5 rounded-xl font-semibold text-sm"
              style={{
                background: 'transparent',
                color: theme.color.global.gray,
                border: '1px solid rgba(255,255,255,0.1)',
                opacity: isProcessing ? 0.5 : 1,
              }}
              disabled={isProcessing}
              onClick={clearRequest}
              whileHover={{ scale: isProcessing ? 1 : 1.02 }}
              whileTap={{ scale: isProcessing ? 1 : 0.97 }}
              transition={{ type: 'spring', damping: 20, stiffness: 400 }}
            >
              Cancel
            </motion.button>
          </form>
        </motion.div>
      </Show>
    </>
  );
};
