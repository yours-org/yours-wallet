import React, { useEffect, useState } from 'react';
import { Transaction } from '@bsv/sdk';
import { motion } from 'framer-motion';
import { ArrowRightLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import TxPreview from '../../components/TxPreview';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { sleep } from '../../utils/sleep';
import { BSV_DECIMAL_CONVERSION } from '../../utils/constants';
import type { ApprovalContext, YoursApprovalType } from '../../yoursApi';
import type { ParseContext } from '@1sat/wallet-browser';

export type TransactionApprovalResponse = {
  approved: boolean;
  error?: string;
};

export type TransactionApprovalRequestProps = {
  request: ApprovalContext;
  popupId: number | undefined;
  onResponse: () => void;
};

const getApprovalTitle = (type: YoursApprovalType): string => {
  switch (type) {
    case 'sendBsv':
      return 'Send BSV';
    case 'sendAllBsv':
      return 'Send All BSV';
    case 'transferOrdinal':
      return 'Transfer Ordinal';
    case 'listOrdinal':
      return 'List Ordinal';
    case 'inscribe':
      return 'Create Inscription';
    case 'lockBsv':
      return 'Lock BSV';
    default:
      return 'Transaction';
  }
};

export const TransactionApprovalRequest = (props: TransactionApprovalRequestProps) => {
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService, wallet } = useServiceContext();
  const { bsvAddress, ordAddress, identityAddress } = keysService;
  const { request, onResponse, popupId } = props;
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [txData, setTxData] = useState<ParseContext>();
  const [satsOut, setSatsOut] = useState(0);

  useEffect(() => {
    (async () => {
      if (!request.signableTransactionBEEF || !wallet?.parseTransaction) return;
      setIsLoading(true);
      try {
        const tx = Transaction.fromAtomicBEEF(request.signableTransactionBEEF);
        const parsedTx = await wallet.parseTransaction(tx);
        setTxData(parsedTx);
      } catch (error) {
        console.error('Failed to parse transaction BEEF:', error);
      }
      setIsLoading(false);
    })();
  }, [wallet, request.signableTransactionBEEF]);

  useEffect(() => {
    if (!bsvAddress || !ordAddress || !identityAddress || !wallet || !txData) return;
    (async () => {
      const userAddresses = [bsvAddress, ordAddress, identityAddress];

      let userSatsOut = txData.spends.reduce((acc, spend) => {
        if (spend.owner && userAddresses.includes(spend.owner)) {
          return acc + BigInt(spend.output.satoshis || 0);
        }
        return acc;
      }, 0n);

      userSatsOut = txData.txos.reduce((acc, txo) => {
        if (txo.owner && userAddresses.includes(txo.owner)) {
          return acc - BigInt(txo.output.satoshis || 0);
        }
        return acc;
      }, userSatsOut);

      setSatsOut(Number(userSatsOut));
    })();
  }, [txData, bsvAddress, ordAddress, identityAddress, wallet]);

  const totalOutputSats = request.createActionParams.outputs?.reduce((sum, output) => sum + output.satoshis, 0) || 0;
  const outputCount = request.createActionParams.outputs?.length || 0;
  const inputCount = request.createActionParams.inputs?.length || 0;

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const resetState = () => {
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!message) {
      resetState();
    }
  }, [message]);

  const handleApprove = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    sendMessage({
      action: 'transactionApprovalResponse',
      approved: true,
    });
    onResponse();
    window.close();
  };

  const handleReject = async () => {
    sendMessage({
      action: 'transactionApprovalResponse',
      approved: false,
    });
    await chromeStorageService.remove('transactionApprovalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const title = getApprovalTitle(request.type);
  const displayAmount = txData ? satsOut : totalOutputSats;
  const amountLabel =
    displayAmount > 0 ? `Approve — ${(displayAmount / BSV_DECIMAL_CONVERSION).toFixed(8)} BSV` : 'Approve';

  return (
    <>
      <Show when={isProcessing || isLoading}>
        <PageLoader theme={theme} message={isLoading ? 'Loading transaction...' : 'Processing...'} />
      </Show>

      <Show when={!isProcessing && !isLoading && !!request}>
        <motion.div
          className="flex flex-col w-full px-4 pt-5 pb-4"
          style={{ maxHeight: 'calc(100vh - 8rem)', overflowY: 'auto' }}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(161,255,139,0.12)' }}
            >
              <ArrowRightLeft size={18} style={{ color: '#A1FF8B' }} />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight" style={{ color: theme.color.global.contrast }}>
                {title}
              </h1>
              {request.description && (
                <p className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
                  {request.description}
                </p>
              )}
            </div>
          </div>

          {/* Amount display — shown when we have a meaningful amount */}
          <Show when={displayAmount > 0 && !txData}>
            <motion.div
              className="rounded-2xl px-4 py-4 mb-4 text-center"
              style={{ background: theme.color.global.row, border: '1px solid rgba(255,255,255,0.06)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.08 }}
            >
              <p className="text-2xl font-bold" style={{ color: theme.color.global.contrast }}>
                {(displayAmount / BSV_DECIMAL_CONVERSION).toFixed(8)}
                <span className="text-sm font-normal ml-2" style={{ color: theme.color.global.gray }}>
                  BSV
                </span>
              </p>
            </motion.div>
          </Show>

          {/* TxPreview if BEEF was parsed */}
          <Show when={!!txData}>{txData && <TxPreview txData={txData} />}</Show>

          {/* Fallback info rows */}
          <Show when={!txData}>
            <motion.div
              className="rounded-2xl px-4 py-3 mb-4"
              style={{ background: theme.color.global.row, border: '1px solid rgba(255,255,255,0.06)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {inputCount > 0 && (
                <div
                  className="flex justify-between items-center py-2.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-sm" style={{ color: theme.color.global.gray }}>
                    Inputs
                  </span>
                  <span className="text-sm font-semibold" style={{ color: theme.color.global.contrast }}>
                    {inputCount}
                  </span>
                </div>
              )}
              <div
                className="flex justify-between items-center py-2.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-sm" style={{ color: theme.color.global.gray }}>
                  Outputs
                </span>
                <span className="text-sm font-semibold" style={{ color: theme.color.global.contrast }}>
                  {outputCount}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm" style={{ color: theme.color.global.gray }}>
                  Total Output
                </span>
                <span className="text-sm font-semibold" style={{ color: theme.color.global.contrast }}>
                  {(totalOutputSats / BSV_DECIMAL_CONVERSION).toFixed(8)} BSV
                </span>
              </div>
            </motion.div>
          </Show>

          {/* Warning notice */}
          <motion.div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-5"
            style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.15)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.14 }}
          >
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f5a623' }} />
            <p className="text-xs leading-relaxed" style={{ color: '#f5a623' }}>
              Only approve if you trust this application and recognize this transaction.
            </p>
          </motion.div>

          {/* Actions */}
          <form noValidate onSubmit={(e) => handleApprove(e)} className="flex flex-col gap-3">
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
              {amountLabel}
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
              onClick={handleReject}
              whileHover={{ scale: isProcessing ? 1 : 1.02 }}
              whileTap={{ scale: isProcessing ? 1 : 0.97 }}
              transition={{ type: 'spring', damping: 20, stiffness: 400 }}
            >
              Reject
            </motion.button>
          </form>
        </motion.div>
      </Show>
    </>
  );
};
