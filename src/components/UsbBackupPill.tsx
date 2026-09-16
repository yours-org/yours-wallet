import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Usb, X } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { onUsbBackup } from '../services/usbBackup';

const DONE_VISIBLE_MS = 2500;
const REVEAL_DELAY_MS = 1500;
const AMBER = '#FBBF24';

type PillState =
  | { kind: 'syncing'; accountName?: string; accountIndex: number; totalAccounts: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * Slim, non-blocking status pill for the USB backup loop. Sits just under the
 * TopNav. Dismissing the progress pill hides it for the rest of this popup
 * session; the sync itself carries on.
 */
export const UsbBackupPill = () => {
  const { theme } = useTheme();
  const [state, setState] = useState<PillState | null>(null);
  const progressDismissed = useRef(false);
  const dismissedError = useRef<string | undefined>(undefined);
  const doneTimer = useRef<number | undefined>(undefined);
  // A run that finds nothing to write is over in a second or two. Hold the
  // progress pill back briefly so those never flash; a run that is still
  // going after the delay is worth showing.
  const revealTimer = useRef<number | undefined>(undefined);
  const latestSyncing = useRef<PillState | null>(null);
  const revealed = useRef(false);

  useEffect(() => {
    const clearDoneTimer = () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
      doneTimer.current = undefined;
    };
    const clearRevealTimer = () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      revealTimer.current = undefined;
    };
    const showSyncing = (next: PillState) => {
      latestSyncing.current = next;
      if (revealed.current) setState(next);
    };
    const unsubscribe = onUsbBackup((e) => {
      switch (e.phase) {
        case 'start':
          clearDoneTimer();
          clearRevealTimer();
          revealed.current = false;
          latestSyncing.current = { kind: 'syncing', accountIndex: 0, totalAccounts: e.totalAccounts };
          revealTimer.current = window.setTimeout(() => {
            revealed.current = true;
            if (latestSyncing.current && !progressDismissed.current) setState(latestSyncing.current);
          }, REVEAL_DELAY_MS);
          break;
        case 'account':
          showSyncing({
            kind: 'syncing',
            accountName: e.accountName,
            accountIndex: e.accountIndex,
            totalAccounts: e.totalAccounts,
          });
          break;
        case 'chunk':
          showSyncing({
            ...(latestSyncing.current?.kind === 'syncing'
              ? latestSyncing.current
              : { kind: 'syncing' as const, accountIndex: 0, totalAccounts: 1 }),
            accountName: e.accountName,
          });
          break;
        case 'done':
          clearDoneTimer();
          clearRevealTimer();
          latestSyncing.current = null;
          if (!e.changed || progressDismissed.current) {
            setState(null);
            break;
          }
          setState({ kind: 'done' });
          doneTimer.current = window.setTimeout(() => setState(null), DONE_VISIBLE_MS);
          break;
        case 'error':
          clearDoneTimer();
          clearRevealTimer();
          if (dismissedError.current === e.message) {
            setState(null);
            break;
          }
          setState({ kind: 'error', message: e.message });
          break;
        case 'idle':
          clearRevealTimer();
          latestSyncing.current = null;
          // A run that produced no start (no readable key) or was mid-progress
          // leaves nothing to show; a done flash or error stays on screen.
          setState((prev) => (prev?.kind === 'syncing' ? null : prev));
          break;
      }
    });
    return () => {
      unsubscribe();
      clearDoneTimer();
    };
  }, []);

  const dismiss = () => {
    if (state?.kind === 'syncing') progressDismissed.current = true;
    if (state?.kind === 'error') dismissedError.current = state.message;
    setState(null);
  };

  const visible = state !== null && !(state.kind === 'syncing' && progressDismissed.current);

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const green = theme.color.component.progressBar;

  let label = '';
  let accent = green;
  let progress: number | undefined;
  if (state?.kind === 'syncing') {
    label = state.accountName ? `Backing up to USB key · ${state.accountName}` : 'Backing up to USB key';
    accent = green;
    progress = state.totalAccounts > 0 ? Math.min(1, (state.accountIndex + 1) / state.totalAccounts) : undefined;
  } else if (state?.kind === 'done') {
    label = 'USB backup up to date';
    accent = green;
  } else if (state?.kind === 'error') {
    label = `USB backup paused: ${state.message}`;
    accent = AMBER;
  }

  return (
    <div className="absolute left-0 right-0 top-14 z-[9] flex justify-center px-4 pointer-events-none">
      <AnimatePresence>
        {visible && state && (
          <motion.div
            key={state.kind}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            role="status"
            className="pointer-events-auto flex items-center gap-2 h-8 max-w-full rounded-full pl-3 pr-1.5 overflow-hidden"
            style={{
              backgroundColor: theme.color.global.row,
              border: `1px solid ${accent}40`,
              color: state.kind === 'error' ? AMBER : contrast,
              fontFamily: "'Inter', Arial, Helvetica, sans-serif",
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            }}
          >
            <Usb size={13} style={{ color: accent, flexShrink: 0 }} />
            <div className="flex flex-col justify-center min-w-0 gap-0.5">
              <span className="text-[11px] font-medium leading-tight truncate" title={label}>
                {label}
              </span>
              {state.kind === 'syncing' && (
                <div
                  className="relative h-0.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: `${gray}30` }}
                >
                  {progress !== undefined ? (
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ backgroundColor: accent }}
                      initial={{ width: '8%' }}
                      animate={{ width: `${Math.max(8, progress * 100)}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  ) : (
                    <motion.div
                      className="absolute inset-y-0 w-1/3 rounded-full"
                      style={{ backgroundColor: accent }}
                      animate={{ left: ['-33%', '100%'] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="flex items-center justify-center w-5 h-5 rounded-full border-none bg-transparent cursor-pointer shrink-0 hover:bg-white/10"
              style={{ color: gray }}
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
