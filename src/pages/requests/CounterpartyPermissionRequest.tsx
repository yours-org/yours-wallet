import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Loader2 } from 'lucide-react';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import type {
  CounterpartyPermissionRequest as CounterpartyPermissionRequestType,
  CounterpartyPermissions,
} from '@bsv/wallet-toolbox-mobile';

export type CounterpartyPermissionRequestProps = {
  request: CounterpartyPermissionRequestType;
  popupId: number | undefined;
  onResponse: () => void;
};

export const CounterpartyPermissionRequestPage = (props: CounterpartyPermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);
  const { permissions } = request;

  const [protocolChecked, setProtocolChecked] = useState<boolean[]>(() => permissions.protocols.map(() => true));

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const buildGranted = (): Partial<CounterpartyPermissions> => {
    const checkedProtocols = permissions.protocols.filter((_, i) => protocolChecked[i]);
    if (checkedProtocols.length === 0) return {};
    return { protocols: checkedProtocols };
  };

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'COUNTERPARTY_PERMISSION_RESPONSE',
        requestID: request.requestID,
        granted: buildGranted(),
      });
      onResponse();
      window.close();
    } catch (error) {
      addSnackbar(error instanceof Error ? error.message : String(error), 'error');
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    sendMessage({
      action: 'COUNTERPARTY_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    onResponse();
    window.close();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'COUNTERPARTY_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const toggleProtocol = (i: number) => setProtocolChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));

  const counterpartyDisplay =
    request.counterpartyLabel ?? `${request.counterparty.slice(0, 8)}...${request.counterparty.slice(-8)}`;

  return (
    <motion.div
      className="flex flex-col w-full px-4 pt-5 pb-4"
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
          <Users size={18} style={{ color: '#A1FF8B' }} />
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight" style={{ color: theme.color.global.contrast }}>
            Counterparty Permission
          </h1>
          <p className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
            <span className="font-semibold" style={{ color: theme.color.global.contrast }}>
              {request.originator}
            </span>{' '}
            wants to interact with a counterparty
          </p>
        </div>
      </div>

      {/* Details card */}
      <motion.div
        className="w-full rounded-2xl px-4 py-3 mb-4"
        style={{
          background: theme.color.global.row,
          border: '1px solid rgba(255,255,255,0.06)',
          maxHeight: '16rem',
          overflowY: 'auto',
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        {/* Counterparty row */}
        <div className="flex flex-row py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-xs font-semibold w-24 flex-shrink-0" style={{ color: theme.color.global.gray }}>
            Counterparty
          </span>
          <span className="text-xs break-all font-mono" style={{ color: theme.color.global.contrast }}>
            {counterpartyDisplay}
          </span>
        </div>

        {/* Purpose */}
        <Show when={!!permissions.description}>
          <div className="flex flex-row py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs font-semibold w-24 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Purpose
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {permissions.description}
            </span>
          </div>
        </Show>

        {/* Protocols section */}
        <p className="text-xs font-bold uppercase tracking-wider pt-3 pb-1" style={{ color: theme.color.global.gray }}>
          Protocols
        </p>
        {permissions.protocols.map((p, i) => (
          <label
            key={`proto-${i}`}
            className="flex items-start gap-3 py-2 cursor-pointer"
            style={{ borderBottom: i < permissions.protocols.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
          >
            <input
              type="checkbox"
              checked={protocolChecked[i]}
              onChange={() => toggleProtocol(i)}
              className="mt-0.5 accent-green-400"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium" style={{ color: theme.color.global.contrast }}>
                {p.protocolID[1]} (level {p.protocolID[0]})
              </span>
              {p.description && (
                <span className="text-xs mt-0.5 opacity-60" style={{ color: theme.color.global.contrast }}>
                  {p.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </motion.div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-auto">
        <motion.button
          className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #A1FF8B 0%, #34D399 100%)',
            color: '#010101',
            opacity: isProcessing ? 0.6 : 1,
          }}
          disabled={isProcessing}
          onClick={handleGrant}
          whileHover={{ scale: isProcessing ? 1 : 1.02 }}
          whileTap={{ scale: isProcessing ? 1 : 0.97 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
        >
          {isProcessing && <Loader2 size={14} className="animate-spin" />}
          Allow Selected
        </motion.button>

        <motion.button
          className="w-full py-3.5 rounded-xl font-semibold text-sm"
          style={{
            background: 'transparent',
            color: theme.color.global.gray,
            border: '1px solid rgba(255,255,255,0.1)',
            opacity: isProcessing ? 0.5 : 1,
          }}
          disabled={isProcessing}
          onClick={handleDeny}
          whileHover={{ scale: isProcessing ? 1 : 1.02 }}
          whileTap={{ scale: isProcessing ? 1 : 0.97 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
        >
          Deny All
        </motion.button>
      </div>
    </motion.div>
  );
};
