import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Usb } from 'lucide-react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useTheme } from '../hooks/useTheme';
import { probeSticks, requestNextStickPermission, type StickProbe } from '../services/UsbKey.service';
import { PageLoader } from './PageLoader';

const RECHECK_MS = 5000;

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
  const probing = useRef(false);

  const check = useCallback(async () => {
    if (!usbSecurity?.enabled || probing.current) return;
    probing.current = true;
    try {
      const result = await probeSticks(usbSecurity);
      setProbe(result);
      if (result.status === 'absent' || result.status === 'no-handles') await lockWallet();
    } catch {
      await lockWallet();
    } finally {
      probing.current = false;
    }
  }, [usbSecurity, lockWallet]);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const timer = window.setInterval(() => void check(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, check]);

  const allow = async () => {
    if (probe?.status !== 'permission' || busy) return;
    setBusy(true);
    try {
      await requestNextStickPermission(probe.stickIds);
      const result = usbSecurity ? await probeSticks(usbSecurity) : undefined;
      setProbe(result);
      if (result?.status !== 'ok') await lockWallet();
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || probe?.status === 'ok') return <>{children}</>;

  if (probe === undefined || probe.status !== 'permission') {
    return <PageLoader message="Checking USB key..." theme={theme} />;
  }

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
        <p className="text-base font-bold m-0">Confirm your USB key</p>
        <p className="text-xs m-0 mt-1" style={{ color: gray }}>
          Chrome needs access to read it.
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
          onClick={() => void allow()}
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
          ) : (
            'Allow USB access'
          )}
        </button>
      </motion.div>
    </motion.div>
  );
};
