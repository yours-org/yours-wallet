import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Loader2 } from 'lucide-react';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import type {
  GroupedPermissionRequest as GroupedPermissionRequestType,
  GroupedPermissions,
} from '@bsv/wallet-toolbox-mobile';

export type GroupedPermissionRequestProps = {
  request: GroupedPermissionRequestType;
  popupId: number | undefined;
  onResponse: () => void;
};

export const GroupedPermissionRequestPage = (props: GroupedPermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);
  const { permissions } = request;

  const [protocolChecked, setProtocolChecked] = useState<boolean[]>(() =>
    (permissions.protocolPermissions ?? []).map(() => true),
  );
  const [basketChecked, setBasketChecked] = useState<boolean[]>(() => (permissions.basketAccess ?? []).map(() => true));
  const [certChecked, setCertChecked] = useState<boolean[]>(() =>
    (permissions.certificateAccess ?? []).map(() => true),
  );
  const [spendingChecked, setSpendingChecked] = useState(!!permissions.spendingAuthorization);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const buildGranted = (): Partial<GroupedPermissions> => {
    const granted: Partial<GroupedPermissions> = {};
    const checkedProtocols = (permissions.protocolPermissions ?? []).filter((_, i) => protocolChecked[i]);
    if (checkedProtocols.length > 0) granted.protocolPermissions = checkedProtocols;
    const checkedBaskets = (permissions.basketAccess ?? []).filter((_, i) => basketChecked[i]);
    if (checkedBaskets.length > 0) granted.basketAccess = checkedBaskets;
    const checkedCerts = (permissions.certificateAccess ?? []).filter((_, i) => certChecked[i]);
    if (checkedCerts.length > 0) granted.certificateAccess = checkedCerts;
    if (spendingChecked && permissions.spendingAuthorization) {
      granted.spendingAuthorization = permissions.spendingAuthorization;
    }
    return granted;
  };

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'GROUPED_PERMISSION_RESPONSE',
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
      action: 'GROUPED_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    onResponse();
    window.close();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'GROUPED_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const toggleProtocol = (i: number) => setProtocolChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  const toggleBasket = (i: number) => setBasketChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  const toggleCert = (i: number) => setCertChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));

  return (
    <motion.div
      className="flex flex-col w-full px-4 pt-5 pb-4"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(161,255,139,0.12)' }}
        >
          <Shield size={18} style={{ color: '#A1FF8B' }} />
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight" style={{ color: theme.color.global.contrast }}>
            Permission Request
          </h1>
          <p className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
            <span className="font-semibold" style={{ color: theme.color.global.contrast }}>
              {request.originator}
            </span>{' '}
            is requesting the following permissions
          </p>
        </div>
      </div>

      {/* Description */}
      <Show when={!!permissions.description}>
        <p className="text-xs mb-3 leading-relaxed" style={{ color: theme.color.global.gray }}>
          {permissions.description}
        </p>
      </Show>

      {/* Permissions list */}
      <motion.div
        className="w-full rounded-2xl px-4 py-2 mb-5"
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
        {/* Protocols */}
        <Show when={!!permissions.protocolPermissions?.length}>
          <p
            className="text-xs font-bold uppercase tracking-wider pt-3 pb-1"
            style={{ color: theme.color.global.gray }}
          >
            Protocols
          </p>
          {permissions.protocolPermissions?.map((p, i) => (
            <label
              key={`proto-${i}`}
              className="flex items-start gap-3 py-2 cursor-pointer"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
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
                  {p.counterparty ? ` — ${p.counterparty.slice(0, 10)}...` : ''}
                </span>
                {p.description && (
                  <span className="text-xs mt-0.5 opacity-60" style={{ color: theme.color.global.contrast }}>
                    {p.description}
                  </span>
                )}
              </div>
            </label>
          ))}
        </Show>

        {/* Baskets */}
        <Show when={!!permissions.basketAccess?.length}>
          <p
            className="text-xs font-bold uppercase tracking-wider pt-3 pb-1"
            style={{ color: theme.color.global.gray }}
          >
            Baskets
          </p>
          {permissions.basketAccess?.map((b, i) => (
            <label
              key={`basket-${i}`}
              className="flex items-start gap-3 py-2 cursor-pointer"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <input
                type="checkbox"
                checked={basketChecked[i]}
                onChange={() => toggleBasket(i)}
                className="mt-0.5 accent-green-400"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium" style={{ color: theme.color.global.contrast }}>
                  {b.basket}
                </span>
                {b.description && (
                  <span className="text-xs mt-0.5 opacity-60" style={{ color: theme.color.global.contrast }}>
                    {b.description}
                  </span>
                )}
              </div>
            </label>
          ))}
        </Show>

        {/* Certificates */}
        <Show when={!!permissions.certificateAccess?.length}>
          <p
            className="text-xs font-bold uppercase tracking-wider pt-3 pb-1"
            style={{ color: theme.color.global.gray }}
          >
            Certificates
          </p>
          {permissions.certificateAccess?.map((c, i) => (
            <label
              key={`cert-${i}`}
              className="flex items-start gap-3 py-2 cursor-pointer"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <input
                type="checkbox"
                checked={certChecked[i]}
                onChange={() => toggleCert(i)}
                className="mt-0.5 accent-green-400"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium" style={{ color: theme.color.global.contrast }}>
                  {c.type}
                </span>
                <span className="text-xs mt-0.5 opacity-60" style={{ color: theme.color.global.contrast }}>
                  {c.description} — fields: {c.fields.join(', ')}
                </span>
              </div>
            </label>
          ))}
        </Show>

        {/* Spending */}
        <Show when={!!permissions.spendingAuthorization}>
          <p
            className="text-xs font-bold uppercase tracking-wider pt-3 pb-1"
            style={{ color: theme.color.global.gray }}
          >
            Spending
          </p>
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={spendingChecked}
              onChange={() => setSpendingChecked(!spendingChecked)}
              className="mt-0.5 accent-green-400"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold" style={{ color: '#A1FF8B' }}>
                {(permissions.spendingAuthorization?.amount ?? 0).toLocaleString()} satoshis
              </span>
              {permissions.spendingAuthorization?.description && (
                <span className="text-xs mt-0.5 opacity-60" style={{ color: theme.color.global.contrast }}>
                  {permissions.spendingAuthorization.description}
                </span>
              )}
            </div>
          </label>
        </Show>
      </motion.div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
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
