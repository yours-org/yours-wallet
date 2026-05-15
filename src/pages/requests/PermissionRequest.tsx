import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import type { PermissionRequest as PermissionRequestType } from '@bsv/wallet-toolbox-mobile';

export type PermissionRequestProps = {
  request: PermissionRequestType & { requestID: string };
  popupId: number | undefined;
  onResponse: () => void;
};

const getPermissionTitle = (type: string): string => {
  switch (type) {
    case 'protocol':
      return 'Protocol Permission';
    case 'basket':
      return 'Basket Access';
    case 'certificate':
      return 'Certificate Access';
    case 'spending':
      return 'Spending Authorization';
    default:
      return 'Permission Request';
  }
};

const getPermissionDescription = (request: PermissionRequestType): string => {
  switch (request.type) {
    case 'protocol':
      return `An application is requesting permission to use protocol "${request.protocolID?.[1] || 'unknown'}" with security level ${request.protocolID?.[0] || 0}.`;
    case 'basket':
      return `An application is requesting access to basket "${request.basket || 'unknown'}".`;
    case 'certificate':
      return `An application is requesting access to certificate data.`;
    case 'spending':
      return `An application is requesting authorization to spend ${request.spending?.satoshis || 0} satoshis.`;
    default:
      return 'An application is requesting a permission.';
  }
};

const formatSatoshis = (sats: number): string => {
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BSV`;
  }
  return `${sats.toLocaleString()} satoshis`;
};

export const PermissionRequestPage = (props: PermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'PERMISSION_RESPONSE',
        requestID: request.requestID,
        granted: true,
      });
      onResponse();
      window.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    sendMessage({
      action: 'PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: false,
    });
    onResponse();
    window.close();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: false,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <motion.div
      className="flex flex-col w-full px-4 pt-5 pb-4 overflow-y-auto"
      style={{ maxHeight: '100vh' }}
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
          <Shield size={18} style={{ color: '#A1FF8B' }} />
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight" style={{ color: theme.color.global.contrast }}>
            {getPermissionTitle(request.type)}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
            {getPermissionDescription(request)}
          </p>
        </div>
      </div>

      {/* Details card */}
      <motion.div
        className="w-full rounded-2xl px-4 py-3 mb-4"
        style={{
          background: theme.color.global.row,
          border: '1px solid rgba(255,255,255,0.06)',
          maxHeight: '12rem',
          overflowY: 'auto',
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        {/* Origin row — always shown */}
        <div className="flex flex-row py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
            Origin
          </span>
          <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
            {request.displayOriginator || request.originator}
          </span>
        </div>

        {/* Protocol fields */}
        <Show when={request.type === 'protocol' && !!request.protocolID}>
          <div className="flex flex-row py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Protocol
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {request.protocolID?.[1]}
            </span>
          </div>
          <div
            className="flex flex-row py-2"
            style={{ borderBottom: request.counterparty ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
          >
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Security
            </span>
            <span className="text-xs" style={{ color: theme.color.global.contrast }}>
              Level {request.protocolID?.[0]}
            </span>
          </div>
          <Show when={!!request.counterparty}>
            <div className="flex flex-row py-2">
              <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
                Counterparty
              </span>
              <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
                {request.counterparty}
              </span>
            </div>
          </Show>
        </Show>

        {/* Basket fields */}
        <Show when={request.type === 'basket' && !!request.basket}>
          <div className="flex flex-row py-2">
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Basket
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {request.basket}
            </span>
          </div>
        </Show>

        {/* Certificate fields */}
        <Show when={request.type === 'certificate' && !!request.certificate}>
          <div className="flex flex-row py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Cert Type
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {request.certificate?.certType}
            </span>
          </div>
          <div className="flex flex-row py-2">
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Fields
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {request.certificate?.fields.join(', ')}
            </span>
          </div>
        </Show>

        {/* Spending fields */}
        <Show when={request.type === 'spending' && !!request.spending}>
          <div
            className="flex flex-row py-2"
            style={{ borderBottom: request.spending?.lineItems?.length ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
          >
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Amount
            </span>
            <span className="text-xs font-semibold" style={{ color: '#A1FF8B' }}>
              {formatSatoshis(request.spending?.satoshis || 0)}
            </span>
          </div>
          <Show when={!!request.spending?.lineItems?.length}>
            {request.spending?.lineItems?.map((item, i) => (
              <div
                key={i}
                className="flex flex-row py-2"
                style={{
                  borderBottom:
                    i < (request.spending?.lineItems?.length ?? 0) - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
                  {item.type}
                </span>
                <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
                  {item.description} ({formatSatoshis(item.satoshis)})
                </span>
              </div>
            ))}
          </Show>
        </Show>

        {/* Reason */}
        <Show when={!!request.reason}>
          <div className="flex flex-row py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: theme.color.global.gray }}>
              Reason
            </span>
            <span className="text-xs break-all" style={{ color: theme.color.global.contrast }}>
              {request.reason}
            </span>
          </div>
        </Show>
      </motion.div>

      {/* Privileged warning */}
      <Show when={!!request.privileged}>
        <motion.div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4"
          style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.15)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f5a623' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#f5a623' }}>
            This is a privileged operation
          </p>
        </motion.div>
      </Show>

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
          Allow
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
          Deny
        </motion.button>
      </div>
    </motion.div>
  );
};
