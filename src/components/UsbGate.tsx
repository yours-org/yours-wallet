import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Usb } from 'lucide-react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useTheme } from '../hooks/useTheme';
import { openUsbWindow, probeSticks, requestNextStickPermission, type StickProbe } from '../services/UsbKey.service';
import { isUsbRecoverySession, markUsbSeen } from '../services/usbPresence';
import { PageLoader } from './PageLoader';

const RECHECK_MS = 5000;
/** A single failed read is ignored (sleep/wake, flaky readers); two in a row means the key is out. */
const MISSES_TO_LOCK = 2;

/**
 * USB unlock: the popup checks for the key as soon as it opens on an unlocked
 * wallet, and keeps checking while open. A key that is gone locks the wallet.
 * A key that Chrome cannot read yet (the grant died with the last popup) needs
 * one click to re-grant, since the browser requires a gesture for that.
 * With USB unlock off this renders its children immediately.
 */
export const UsbGate = ({ children }: { children: ReactNode }) => {
  const { theme } = useTheme();
  const { chromeStorageService, lockWallet } = useServiceContext();
  const usbSecurity = chromeStorageService.getUsbSecurity();
  const enabled = !!usbSecurity?.enabled;
  const [probe, setProbe] = useState<StickProbe | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Unlocked with the recovery code and no key at hand: no probing this
  // session, and a visible reminder that the key was not checked.
  const [recovery, setRecovery] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!enabled) {
      setRecovery(false);
      return;
    }
    void isUsbRecoverySession().then((v) => {
      console.log('[UsbGate] recovery session:', v);
      setRecovery(v);
    });
    // Follow the marker: it is written by the unlock screen and removed on lock.
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'session' || !('usbRecoverySessionAt' in changes)) return;
      setRecovery(typeof changes.usbRecoverySessionAt.newValue === 'number');
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [enabled]);
  const probing = useRef(false);
  const misses = useRef(0);

  const check = useCallback(async () => {
    if (!usbSecurity?.enabled || probing.current) return;
    probing.current = true;
    try {
      let result: StickProbe;
      try {
        result = await probeSticks(usbSecurity);
      } catch {
        result = { status: 'absent' };
      }
      setProbe(result);
      // Only a failed read under a live grant counts as removal. 'permission'
      // (no grant yet) and 'no-handles' (nothing saved on this profile, e.g.
      // right after a recovery-code unlock while the rotate window is open)
      // say nothing about whether a drive is in, so they never lock.
      if (result.status === 'ok') {
        misses.current = 0;
        await markUsbSeen();
      } else if (result.status === 'absent' && ++misses.current >= MISSES_TO_LOCK) {
        misses.current = 0;
        await lockWallet();
      }
    } finally {
      probing.current = false;
    }
  }, [usbSecurity, lockWallet]);

  useEffect(() => {
    if (!enabled || recovery !== false) return;
    void check();
    const timer = window.setInterval(() => void check(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, recovery, check]);

  const allow = async () => {
    if (probe?.status !== 'permission' || busy) return;
    setBusy(true);
    try {
      await requestNextStickPermission(probe.stickIds);
      const result = usbSecurity ? await probeSticks(usbSecurity) : undefined;
      setProbe(result);
      // Still not readable after a grant: the drive is not there.
      if (result?.status !== 'ok') await lockWallet();
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return <>{children}</>;
  if (recovery === undefined) return <PageLoader message="Checking USB key..." theme={theme} />;
  if (recovery) {
    return (
      <>
        <div
          className="absolute left-0 right-0 top-14 z-[8] flex justify-center px-4 pointer-events-none"
          aria-live="polite"
        >
          <span
            className="text-[10px] font-medium rounded-full px-2.5 py-0.5"
            style={{
              color: '#FBBF24',
              backgroundColor: theme.color.global.row,
              border: '1px solid #FBBF2440',
              fontFamily: "'Inter', Arial, Helvetica, sans-serif",
            }}
          >
            Unlocked with recovery code · USB key not checked this session
          </span>
        </div>
        {children}
      </>
    );
  }
  if (probe?.status === 'ok') return <>{children}</>;

  if (probe === undefined || probe.status === 'absent') {
    return <PageLoader message="Checking USB key..." theme={theme} />;
  }

  const noHandles = probe.status === 'no-handles';

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center text-center gap-4 px-8 w-full h-full"
      style={{ color: contrast }}
    >
      <Usb size={32} style={{ color: gray }} />
      <div>
        <p className="text-base font-bold m-0">{noHandles ? 'Register a USB key' : 'Confirm your USB key'}</p>
        <p className="text-xs m-0 mt-1" style={{ color: gray }}>
          {noHandles ? 'No USB key is set up on this computer yet.' : 'Chrome needs access to read it.'}
        </p>
      </div>
      <motion.div
        whileHover={!busy ? { scale: 1.02 } : undefined}
        whileTap={!busy ? { scale: 0.98 } : undefined}
        className="flex items-center w-[87%] p-px rounded-xl"
        style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => (noHandles ? void openUsbWindow('repick') : void allow())}
          className="relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-10 px-4 outline-none select-none cursor-pointer border-none disabled:opacity-50 gap-2"
          style={{
            backgroundColor: theme.color.global.walletBackground,
            color: contrast,
            fontFamily: "'Inter', Arial, Helvetica, sans-serif",
          }}
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Checking...
            </>
          ) : noHandles ? (
            'Find my USB key'
          ) : (
            'Allow USB access'
          )}
        </button>
      </motion.div>
    </motion.div>
  );
};
