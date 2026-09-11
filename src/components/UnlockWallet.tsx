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
  type StickProbe,
  adoptPickedDrive,
  openUsbWindow,
  pickDrive,
  probeSticks,
  requestNextStickPermission,
} from '../services/UsbKey.service';
import { markUsbSeen, resetUsbPresence, startUsbRecoverySession } from '../services/usbPresence';
import { decodeRecoveryCode, verifyMasterCheck } from '../utils/usbCrypto';
import type { UsbUnlockMaterial } from '../services/passKey';

export type UnlockWalletProps = {
  onUnlock: () => void;
};

const USB_PROBE_INTERVAL_MS = 2000;

/**
 * The action popup closes on any focus change and Chrome drops drive grants
 * when the last extension page closes, so it can never complete a USB unlock
 * itself. The prompt window and the USB window are real windows and can.
 */
const IN_STANDALONE_WINDOW = /\/(usb|prompt)\.html$/.test(window.location.pathname);

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
  // True when a recent grant attempt from this popup didn't stick (Chrome
  // closed the popup under its bubble, or access was refused).
  const [grantFailed, setGrantFailed] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  /** Why the code is being used: the key is gone (rotate) or just not at hand (this session only). */
  const [recoveryIntent, setRecoveryIntent] = useState<'lost' | 'session' | null>(null);
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
    if (!usbEnabled || IN_STANDALONE_WINDOW) return;
    void chrome.storage.session.get('usbGrantAttemptAt').then((r) => {
      const at = r.usbGrantAttemptAt as number | undefined;
      if (at && Date.now() - at < 60_000) setGrantFailed(true);
    });
  }, [usbEnabled]);

  useEffect(() => {
    if (!usbEnabled) return;
    void runProbe();
    const timer = window.setInterval(() => void runProbe(), USB_PROBE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [usbEnabled, runProbe]);

  /**
   * After a browser restart Chrome wants the user to re-confirm access to the
   * saved drive handles. That needs a user gesture, and the Unlock click is
   * one, so this runs inside the unlock handler instead of behind a separate
   * button. Returns the fresh probe.
   */
  const grantUsbAccessIfNeeded = async (): Promise<StickProbe | undefined> => {
    const latest = probeRef.current;
    if (latest?.status !== 'permission') return latest;
    // If Chrome's bubble closes the action popup, this marker is what tells the
    // next popup to offer the standalone window instead of looping. It is
    // cleared as soon as the request returns, because returning at all means
    // the popup survived.
    if (!IN_STANDALONE_WINDOW) {
      await chrome.storage.session.set({ usbGrantAttemptAt: Date.now() }).catch(() => {});
    }
    await requestNextStickPermission(latest.stickIds);
    if (!IN_STANDALONE_WINDOW) {
      await chrome.storage.session.remove('usbGrantAttemptAt').catch(() => {});
    }
    // Probe directly rather than via runProbe so an in-flight timer probe can't make us skip it.
    try {
      const result = usbSecurity ? await probeSticks(usbSecurity) : undefined;
      probeRef.current = result;
      setProbe(result);
      return result;
    } catch {
      return { status: 'absent' };
    }
  };

  /** Standalone windows only: pick the drive right here, then carry on unlocking. */
  const findKeyInline = async () => {
    if (!usbSecurity) return;
    try {
      const handle = await pickDrive();
      const result = await adoptPickedDrive(handle, usbSecurity);
      probeRef.current = result;
      setProbe(result);
      setErrorText(result.status === 'ok' ? '' : "That drive doesn't hold a registered key");
    } catch {
      // Picker dismissed.
    }
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
        const latest = await grantUsbAccessIfNeeded();
        if (latest?.status !== 'ok') {
          // Missing key is not a wrong password: shake, say so, and leave the password alone.
          // Still 'permission' after a request means Chrome had no drive to grant: it is not plugged in.
          failUnlock('Insert your USB key');
          return;
        }
        material = { master: latest.master };
        await markUsbSeen();
      }
    }

    const isVerified = await chromeStorageService.verifyPassword(password, material);
    if (isVerified) {
      setVerificationFailed(false);
      setErrorText('');
      if (usbEnabled) resetUsbPresence();
      // The code stands in for the key this session when the key is merely
      // elsewhere. Recorded before anything can flip the popup to unlocked,
      // so the gate never sees an unlocked wallet without the marker.
      if (unlockedViaRecovery && recoveryIntent === 'session') await startUsbRecoverySession();
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
      // The key is gone: walk the user into rotation right away.
      if (unlockedViaRecovery && recoveryIntent === 'lost') void openUsbWindow('rotate', { viaRecovery: true });
    } else {
      failUnlock(usbEnabled ? 'Incorrect password' : '');
    }
  };

  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;
  const danger = theme.color.component.warningButton;

  const stickLabel = (stickId: string) => usbSecurity?.sticks.find((s) => s.id === stickId)?.label ?? 'USB key';

  const linkClass = 'text-[11px] underline underline-offset-2 bg-transparent border-none p-0 cursor-pointer';
  const linkStyle = { color: gray, fontFamily: "'Inter', Arial, Helvetica, sans-serif" };

  const usbStatus = usbEnabled && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="flex flex-col items-center gap-1.5 -mt-5 mb-5 text-xs text-center max-w-[85%]"
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
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#34D399' }} />
          USB key: {stickLabel(probe.stickId)}
        </span>
      ) : probe.status === 'permission' && !recoveryMode ? (
        <span>Chrome needs access to your USB key</span>
      ) : (
        <>
          <span>Insert your USB key</span>
          <span className="flex items-center gap-3">
            {IN_STANDALONE_WINDOW && (
              <button type="button" className={linkClass} style={linkStyle} onClick={() => void findKeyInline()}>
                Find my USB key
              </button>
            )}
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

  const canSubmit = password !== '' && (!recoveryMode || (recoveryCode.trim() !== '' && recoveryIntent !== null));

  // The popup reads the drive itself, including asking Chrome for access on
  // the Unlock click. It hands off to the standalone window only when it
  // can't: no saved handle (the folder picker closes the popup), or a grant
  // attempt from here didn't stick.
  const handOffToWindow =
    usbEnabled &&
    !IN_STANDALONE_WINDOW &&
    !recoveryMode &&
    (probe?.status === 'no-handles' || (probe?.status === 'permission' && grantFailed));

  // Two clicks by design: "Allow USB access" gets Chrome's grant (a gesture is
  // required, and the button says what is actually happening), then the
  // password form appears with the key confirmed.
  const needsAllowStep = usbEnabled && !recoveryMode && !handOffToWindow && probe?.status === 'permission';

  const handleAllowAccess = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorText('');
    try {
      const result = await grantUsbAccessIfNeeded();
      // Chrome can't grant access to a drive that isn't there, so a request that
      // comes back still 'permission' means: not plugged in.
      if (result?.status !== 'ok') setErrorText('Insert your USB key, then allow access');
    } finally {
      setIsProcessing(false);
    }
  };

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

      {needsAllowStep ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3 }}
          className="flex flex-col items-center w-full"
        >
          <motion.div
            whileHover={!isProcessing ? { scale: 1.02 } : undefined}
            whileTap={!isProcessing ? { scale: 0.98 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center w-[87%] p-px rounded-xl"
            style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
          >
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleAllowAccess()}
              className="relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-10 px-4 outline-none select-none cursor-pointer border-none disabled:opacity-50 gap-2"
              style={{
                backgroundColor: bg,
                color: contrast,
                fontFamily: "'Inter', Arial, Helvetica, sans-serif",
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Checking...
                </>
              ) : (
                'Allow USB access'
              )}
            </button>
          </motion.div>
          {errorText && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs mt-3"
              style={{ color: danger }}
            >
              {errorText}
            </motion.p>
          )}
        </motion.div>
      ) : handOffToWindow ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3 }}
          className="flex justify-center w-full"
        >
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center w-[87%] p-px rounded-xl"
            style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
          >
            <button
              type="button"
              onClick={() => void openUsbWindow('unlock')}
              className="relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-10 px-4 outline-none select-none cursor-pointer border-none"
              style={{
                backgroundColor: bg,
                color: contrast,
                fontFamily: "'Inter', Arial, Helvetica, sans-serif",
              }}
            >
              Unlock with USB key
            </button>
          </motion.div>
        </motion.div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3 }}
          onSubmit={handleUnlock}
          className="flex flex-col items-center w-full gap-3"
        >
          {usbEnabled && recoveryMode && (
            <>
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
              <div className="flex flex-col gap-1.5 w-[87%]" role="radiogroup" aria-label="Why use the code">
                {(
                  [
                    {
                      id: 'session',
                      label: "I don't have it with me",
                      note: 'Unlock for this session only. Your key still works.',
                    },
                    {
                      id: 'lost',
                      label: 'I lost it or it may be copied',
                      note: 'Replace it with a new key and a new code.',
                    },
                  ] as const
                ).map((opt) => {
                  const selected = recoveryIntent === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRecoveryIntent(opt.id)}
                      className="flex items-start gap-2.5 text-left rounded-xl px-3 py-2 cursor-pointer outline-none"
                      style={{
                        backgroundColor: theme.color.global.row,
                        border: `1px solid ${selected ? contrast : gray + '40'}`,
                        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
                      }}
                    >
                      <span
                        className="mt-0.5 inline-block w-3 h-3 rounded-full shrink-0"
                        style={{
                          border: `2px solid ${selected ? contrast : gray}`,
                          backgroundColor: selected ? contrast : 'transparent',
                        }}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold" style={{ color: contrast }}>
                          {opt.label}
                        </span>
                        <span className="text-[10px] leading-snug" style={{ color: gray }}>
                          {opt.note}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
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
      )}
    </div>
  );
};
