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

export const useSyncTracker = () => {
  const { theme } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [updateBalance, setUpdateBalance] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | undefined>();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const completeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleMessage = (message: SyncStatusMessage) => {
      if (message.action !== YoursEventName.SYNC_STATUS_UPDATE) return;

      const { data } = message;

      switch (data.status) {
        case 'start':
          setSyncMessage(`Syncing ${data.addressCount} addresses`);
          setShowSyncBanner(true);
          setIsSyncing(true);
          if (!intervalRef.current) {
            intervalRef.current = setInterval(() => {
              setUpdateBalance((prev) => !prev);
            }, 5000);
          }
          break;

        case 'progress':
          setPendingCount(data.pending);
          setShowSyncBanner(data.pending > 0 || data.done > 0 || !!data.message);
          if (data.message) {
            setSyncMessage(data.message);
          } else if (data.pending > 0 || data.done > 0) {
            setSyncMessage(`Syncing: ${data.done} done, ${data.pending} pending`);
          }
          break;

        case 'complete':
          if (completeTimeoutRef.current) {
            clearTimeout(completeTimeoutRef.current);
          }
          completeTimeoutRef.current = setTimeout(() => {
            setUpdateBalance(true);
            setIsSyncing(false);
            setShowSyncBanner(false);
            setSyncMessage(undefined);
            setPendingCount(0);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }, 3000);
          break;

        case 'error':
          console.error('Sync error:', data.message);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (completeTimeoutRef.current) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, []);

  return {
    pendingCount,
    showSyncBanner,
    updateBalance,
    theme,
    isSyncing,
    syncMessage,
  };
};
