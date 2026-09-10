import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { sleep } from '../utils/sleep';
import { Input } from './Input';
import { useServiceContext } from '../hooks/useServiceContext';
import { YoursIcon } from './YoursIcon';
import { sendMessageAsync } from '../utils/chromeHelpers';
import {
  getHandle,
  openUsbWindow,
  probeSticks,
  requestHandlePermission,
  type StickProbe,
} from '../services/UsbKey.service';
import { resetUsbPresence } from '../services/usbPresence';
import { decodeRecoveryCode, verifyMasterCheck } from '../utils/usbCrypto';
import type { UsbUnlockMaterial } from '../services/passKey';

export type UnlockWalletProps = {
  onUnlock: () => void;
};

const USB_PROBE_INTERVAL_MS = 2000;

export const UnlockWallet = (props: UnlockWalletProps) => {
  const { onUnlock } = props;
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const { chromeStorageService } = useServiceContext();

  // --- USB key security (only active when the feature is on) ---
  const usbSecurity = chromeStorageService.getUsbSecurity();
  const usbEnabled = !!usbSecurity?.enabled;
  const [probe, setProbe] = useState<StickProbe | undefined>(undefined);
  const probeRef = useRef<StickProbe | undefined>(undefined);
  const probing = useRef(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [errorText, setErrorText] = useState('');

  const runProbe = useCallback(async () => {
    if (!usbSecurity?.enabled || probing.current) return;
    probing.current = true;
    try {
      const result = await probeSticks(usbSecurity);
      probeRef.current = result;
      setProbe(result);
    } catch {
      probeRef.current = { status: 'absent' };
      setProbe({ status: 'absent' });
    } finally {
      probing.current = false;
    }
  }, [usbSecurity]);

  useEffect(() => {
    if (!usbEnabled) return;
    void runProbe();
    const timer = window.setInterval(() => void runProbe(), USB_PROBE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [usbEnabled, runProbe]);

  /** Needs a user gesture: Chrome shows a permission bubble per handle. */
  const handleAllowUsbAccess = async () => {
    if (probe?.status !== 'permission') return;
    for (const id of probe.stickIds) {
      const handle = await getHandle(id);
      if (handle) await requestHandlePermission(handle);
    }
    await runProbe();
  };

  const failUnlock = (message: string) => {
    setErrorText(message);
    setVerificationFailed(true);
    setTimeout(() => {
      setVerificationFailed(false);
      setIsProcessing(false);
    }, 900);
  };

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorText('');
    await sleep(25);

    let material: UsbUnlockMaterial | undefined;
    let unlockedViaRecovery = false;
    if (usbEnabled && usbSecurity) {
      if (recoveryMode) {
        const master = await decodeRecoveryCode(recoveryCode);
        if (!master) {
          failUnlock("That recovery code isn't valid");
          return;
        }
        if (!(await verifyMasterCheck(master, usbSecurity.masterCheck))) {
          failUnlock("That recovery code doesn't match this wallet");
          return;
        }
        material = { master };
        unlockedViaRecovery = true;
      } else {
        const latest = probeRef.current;
        if (latest?.status !== 'ok') {
          // Missing key is not a wrong password: shake, say so, and leave the password alone.
          failUnlock(latest?.status === 'permission' ? 'Allow access to your USB key' : 'Insert your USB key');
          return;
        }
        material = { master: latest.master };
      }
    }

    const isVerified = await chromeStorageService.verifyPassword(password, material);
    if (isVerified) {
      setVerificationFailed(false);
      setErrorText('');
      if (usbEnabled) resetUsbPresence();
      const timestamp = Date.now();
      await chromeStorageService.update({ lastActiveTime: timestamp });

      try {
        const response = await sendMessageAsync<{ success: boolean; error?: string }>({
          action: 'WALLET_UNLOCKED',
        });
        if (!response?.success) {
          console.error('Wallet unlock failed:', response?.error);
        }
      } catch (error) {
        console.error('Wallet unlock error:', error);
      }

      onUnlock();
      // Recovery means every registered stick is gone: walk the user into rotation right away.
      if (unlockedViaRecovery) void openUsbWindow('rotate');
    } else {
      failUnlock(usbEnabled ? 'Incorrect password' : '');
    }
  };

  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const danger = theme.color.component.warningButton;

  const stickLabel = (stickId: string) => usbSecurity?.sticks.find((s) => s.id === stickId)?.label ?? 'USB key';

  const linkClass = 'text-[11px] underline underline-offset-2 bg-transparent border-none p-0 cursor-pointer';
  const linkStyle = { color: gray, fontFamily: "'Inter', Arial, Helvetica, sans-serif" };

  const usbStatus = usbEnabled && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="flex flex-col items-center gap-1.5 -mt-5 mb-5 text-xs"
      style={{ color: gray }}
    >
      {recoveryMode ? (
        <>
          <span>Unlock with your recovery code</span>
          <button
            type="button"
            className={linkClass}
            style={linkStyle}
            onClick={() => {
              setRecoveryMode(false);
              setRecoveryCode('');
              setErrorText('');
            }}
          >
            Use my USB key instead
          </button>
        </>
      ) : probe === undefined ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" />
          Checking for USB key...
        </span>
      ) : probe.status === 'ok' ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#34D399' }} />
          USB key detected: {stickLabel(probe.stickId)}
        </span>
      ) : probe.status === 'permission' ? (
        <>
          <span>Allow access to your USB key</span>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void handleAllowUsbAccess()}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 border-none cursor-pointer outline-none"
            style={{
              backgroundColor: `${accent}22`,
              color: accent,
              fontFamily: "'Inter', Arial, Helvetica, sans-serif",
            }}
          >
            Allow USB access
          </motion.button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gray }} />
            Insert your USB key
          </span>
          <span className="flex items-center gap-3">
            <button type="button" className={linkClass} style={linkStyle} onClick={() => void openUsbWindow('repick')}>
              Find my USB key
            </button>
            <button
              type="button"
              className={linkClass}
              style={linkStyle}
              onClick={() => {
                setRecoveryMode(true);
                setErrorText('');
              }}
            >
              Lost your USB key?
            </button>
          </span>
        </>
      )}
    </motion.div>
  );

  const canSubmit = password !== '' && (!recoveryMode || recoveryCode.trim() !== '');

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        width: '22.5rem',
        height: '33.75rem',
        backgroundColor: bg,
        color: contrast,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-8"
      >
        <YoursIcon width="4rem" />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: contrast }}
      >
        Welcome back
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="text-xs mb-8"
        style={{ color: gray }}
      >
        Enter your password to unlock
      </motion.p>

      {usbStatus}

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.3 }}
        onSubmit={handleUnlock}
        className="flex flex-col items-center w-full gap-3"
      >
        {usbEnabled && recoveryMode && (
          <Input
            theme={theme}
            placeholder="Recovery code"
            type="text"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            shake={verificationFailed ? 'true' : 'false'}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
          />
        )}

        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          shake={verificationFailed ? 'true' : 'false'}
          autoFocus
          onKeyDown={(e) => e.stopPropagation()}
        />

        {usbEnabled && errorText && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs -mt-1"
            style={{ color: danger }}
          >
            {errorText}
          </motion.p>
        )}

        <div className="flex justify-center w-full">
          <motion.div
            whileHover={!isProcessing && canSubmit ? { scale: 1.02 } : undefined}
            whileTap={!isProcessing && canSubmit ? { scale: 0.98 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center w-[87%] p-px rounded-xl"
            style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
          >
            <button
              type="submit"
              disabled={isProcessing || !canSubmit}
              className="relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-10 px-4 outline-none select-none cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none gap-2"
              style={{
                backgroundColor: bg,
                color: contrast,
                fontFamily: "'Inter', Arial, Helvetica, sans-serif",
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Unlocking...
                </>
              ) : (
                'Unlock'
              )}
            </button>
          </motion.div>
        </div>
      </motion.form>
    </div>
  );
};
