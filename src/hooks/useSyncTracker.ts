import { useEffect, useState, useRef } from 'react';
import { YoursEventName } from '../inject';
import { useTheme } from './useTheme';

export type SyncStatusMessage = {
  action: YoursEventName.SYNC_STATUS_UPDATE;
  data:
    | { status: 'start'; addressCount: number }
    | { status: 'progress'; pending: number; done: number; failed: number; message?: string }
    /** A step after the address sync that can take a while, such as the backup push; shown as text. */
    | { status: 'backup'; message: string }
    | { status: 'complete' }
    | { status: 'error'; message: string };
};

/** Safety net — if we see `start` but no `complete` arrives in this window,
 *  assume the sync finished (or the message was dropped) and stop spinning. */
const SYNC_STUCK_TIMEOUT_MS = 30_000;
/** A backup push on a wallet with a lot of history can take minutes; give it a longer safety window. */
const BACKUP_STUCK_TIMEOUT_MS = 15 * 60_000;
/** A quick push should not flash a message; show it only once the step has visibly taken a moment. */
const MESSAGE_REVEAL_DELAY_MS = 1_500;

export const useSyncTracker = () => {
  const { theme } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [updateBalance, setUpdateBalance] = useState(false);
  // Default to false — the spinner should only appear if we actively observe
  // a sync happening. Otherwise the UI can get stuck when the popup mounts
  // after the service worker already finished (or dropped) its `complete` event.
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | undefined>(undefined);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const completeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stuckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const clearAllTimers = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (completeTimeoutRef.current) {
        clearTimeout(completeTimeoutRef.current);
        completeTimeoutRef.current = null;
      }
      if (stuckTimeoutRef.current) {
        clearTimeout(stuckTimeoutRef.current);
        stuckTimeoutRef.current = null;
      }
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
    };

    const finishSync = () => {
      setUpdateBalance(true);
      setIsSyncing(false);
      setPendingCount(0);
      setSyncMessage(undefined);
      clearAllTimers();
    };

    const handleMessage = (message: SyncStatusMessage) => {
      if (message.action !== YoursEventName.SYNC_STATUS_UPDATE) return;

      const { data } = message;

      switch (data.status) {
        case 'start':
          setIsSyncing(true);
          if (!intervalRef.current) {
            intervalRef.current = setInterval(() => {
              setUpdateBalance((prev) => !prev);
            }, 5000);
          }
          if (stuckTimeoutRef.current) clearTimeout(stuckTimeoutRef.current);
          stuckTimeoutRef.current = setTimeout(() => {
            console.warn('[syncTracker] No `complete` received within safety window — stopping spinner.');
            finishSync();
          }, SYNC_STUCK_TIMEOUT_MS);
          break;

        case 'progress':
          setPendingCount(data.pending);
          break;

        case 'backup':
          if (stuckTimeoutRef.current) clearTimeout(stuckTimeoutRef.current);
          stuckTimeoutRef.current = setTimeout(() => {
            console.warn('[syncTracker] No `complete` received after the backup step — stopping spinner.');
            finishSync();
          }, BACKUP_STUCK_TIMEOUT_MS);
          if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
          messageTimeoutRef.current = setTimeout(() => setSyncMessage(data.message), MESSAGE_REVEAL_DELAY_MS);
          break;

        case 'complete':
          if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
          completeTimeoutRef.current = setTimeout(finishSync, 3000);
          break;

        case 'error':
          console.error('Sync error:', data.message);
          // Don't leave the spinner on forever if sync errors out
          finishSync();
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      clearAllTimers();
    };
  }, []);

  return {
    pendingCount,
    updateBalance,
    theme,
    isSyncing,
    syncMessage,
  };
};
