import { useEffect, useState, useRef } from 'react';
import { YoursEventName } from '../inject';
import { useTheme } from './useTheme';

export type SyncStatusMessage = {
  action: YoursEventName.SYNC_STATUS_UPDATE;
  data:
    | { status: 'start'; addressCount: number }
    | { status: 'progress'; pending: number; done: number; failed: number; message?: string }
    | { status: 'complete' }
    | { status: 'error'; message: string };
};

/** Safety net — if we see `start` but no `complete` arrives in this window,
 *  assume the sync finished (or the message was dropped) and stop spinning. */
const SYNC_STUCK_TIMEOUT_MS = 30_000;

export const useSyncTracker = () => {
  const { theme } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [updateBalance, setUpdateBalance] = useState(false);
  // Default to false — the spinner should only appear if we actively observe
  // a sync happening. Otherwise the UI can get stuck when the popup mounts
  // after the service worker already finished (or dropped) its `complete` event.
  const [isSyncing, setIsSyncing] = useState(false);
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
    };

    const finishSync = () => {
      setUpdateBalance(true);
      setIsSyncing(false);
      setPendingCount(0);
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
  };
};
