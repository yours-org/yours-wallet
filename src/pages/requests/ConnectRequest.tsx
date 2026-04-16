import { useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Show } from '../../components/Show';
import { BottomMenuContext } from '../../contexts/BottomMenuContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { RequestParams, WhitelistedApp } from '../../inject';
import { sendMessage } from '../../utils/chromeHelpers';
import { useServiceContext } from '../../hooks/useServiceContext';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { sleep } from '../../utils/sleep';

export type ConnectRequestProps = {
  request: RequestParams | undefined;
  whiteListedApps: WhitelistedApp[];
  popupId: number | undefined;
  onDecision: () => void;
};

const PERMISSIONS = ['View your wallet public keys', 'Request approval for transactions'];

export const ConnectRequest = (props: ConnectRequestProps) => {
  const { request, whiteListedApps, onDecision } = props;
  const { theme } = useTheme();
  const context = useContext(BottomMenuContext);
  const { addSnackbar } = useSnackbar();
  const { keysService, chromeStorageService } = useServiceContext();
  const { identityPubKey, bsvPubKey, ordPubKey, identityAddress } = keysService;

  useEffect(() => {
    if (!context) return;
    context.hideMenu();
    return () => context.showMenu();
  }, [context]);

  useEffect(() => {
    if (!request?.isAuthorized) return;
    if (!identityPubKey || !bsvPubKey || !ordPubKey) return;
    if (!window.location.href.includes('localhost')) {
      onDecision();
      sendMessage({
        action: 'userConnectResponse',
        decision: 'approved',
        pubKeys: { identityPubKey, bsvPubKey, ordPubKey },
      });
    }
  }, [request, identityPubKey, bsvPubKey, ordPubKey, onDecision]);

  const handleAccept = async () => {
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) throw Error('No account found');
    const { settings, pubKeys } = account;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...settings,
          whitelist: [
            ...whiteListedApps,
            {
              domain: request?.domain ?? '',
              icon: request?.appIcon ?? '',
            },
          ],
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
    addSnackbar(`Approved`, 'success');
    await sleep(2000);
    onDecision();
    sendMessage({
      action: 'userConnectResponse',
      decision: 'approved',
      pubKeys,
    });
    window.close();
  };

  const handleDecline = async () => {
    onDecision();
    sendMessage({
      action: 'userConnectResponse',
      decision: 'declined',
    });
    window.close();
  };

  return (
    <Show
      when={!request?.isAuthorized}
      whenFalseContent={
        <div className="flex flex-col items-center justify-center w-full h-full px-6">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ color: theme.color.global.contrast, fontSize: '1.1rem', fontWeight: 600 }}
          >
            Reconnecting to {request?.appName} ...
          </motion.p>
        </div>
      }
    >
      <motion.div
        className="flex flex-col items-center w-full px-5 pt-6 pb-4"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      >
        {/* App icon */}
        {request?.appIcon ? (
          <motion.img
            src={request.appIcon}
            alt={request?.appName}
            className="w-20 h-20 rounded-2xl mb-4 object-cover"
            style={{ border: '1.5px solid rgba(255,255,255,0.08)' }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.06, type: 'spring', damping: 20, stiffness: 300 }}
          />
        ) : (
          <div
            className="w-20 h-20 rounded-2xl mb-4 flex items-center justify-center"
            style={{ background: theme.color.global.row, border: '1.5px solid rgba(255,255,255,0.08)' }}
          >
            <span style={{ color: theme.color.global.gray, fontSize: '2rem' }}>?</span>
          </div>
        )}

        {/* App name */}
        <h1 className="text-xl font-bold text-center mb-1 leading-tight" style={{ color: theme.color.global.contrast }}>
          {request?.appName}
        </h1>

        {/* Domain */}
        <p className="text-sm mb-5" style={{ color: theme.color.global.gray }}>
          {request?.domain}
        </p>

        {/* Permissions card */}
        <motion.div
          className="w-full rounded-2xl px-4 py-3 mb-6"
          style={{ background: theme.color.global.row, border: '1px solid rgba(255,255,255,0.06)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: theme.color.global.gray }}>
            This app will be able to
          </p>
          {PERMISSIONS.map((perm, i) => (
            <motion.div
              key={perm}
              className="flex items-center gap-3 py-2"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.14 + i * 0.06 }}
            >
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(161,255,139,0.15)' }}
              >
                <Check size={12} style={{ color: '#A1FF8B' }} strokeWidth={2.5} />
              </div>
              <span className="text-sm" style={{ color: theme.color.global.contrast }}>
                {perm}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Actions */}
        <motion.button
          className="w-full py-3.5 rounded-xl font-semibold text-sm mb-3"
          style={{
            background: 'linear-gradient(135deg, #A1FF8B 0%, #34D399 100%)',
            color: '#010101',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
          onClick={(e) => {
            e.stopPropagation();
            handleAccept();
          }}
        >
          Connect
        </motion.button>

        <motion.button
          className="w-full py-3.5 rounded-xl font-semibold text-sm"
          style={{
            background: 'transparent',
            color: theme.color.global.gray,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,255,0.2)' }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
          onClick={(e) => {
            e.stopPropagation();
            handleDecline();
          }}
        >
          Cancel
        </motion.button>
      </motion.div>
    </Show>
  );
};
