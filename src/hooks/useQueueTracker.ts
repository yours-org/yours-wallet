import { useEffect, useState, useRef } from 'react';
import { YoursEventName } from '../inject';
import { useTheme } from './useTheme';
import { walletPromise } from '../background';

export type QueueTrackerMessage = {
  action: YoursEventName.QUEUE_STATUS_UPDATE;
  data: { length: number };
};

export type ImportTrackerMessage = {
  action: YoursEventName.IMPORT_STATUS_UPDATE;
  data: { tag: string; name: string };
};

export type FetchingMessage = {
  action: YoursEventName.FETCHING_TX_STATUS_UPDATE;
  data: { txid: string };
};

export const useQueueTracker = () => {
  const { theme } = useTheme();
  const [queueLength, setQueueLength] = useState(0);
  const [showQueueBanner, setShowQueueBanner] = useState(false);
  const [updateBalance, setUpdateBalance] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const twoSecondsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [importName, setImportName] = useState<string | undefined>();
  const [fetchingTxid, setFetchingTxid] = useState<string | undefined>();

  useEffect(() => {
    let isMounted = true;

    const setupWalletListeners = async () => {
      const wallet = await walletPromise;

      const handleSyncStart = (data: { address: string }) => {
        if (!isMounted) return;
        setImportName(`Syncing ${data.address}`);
        setShowQueueBanner(true);
        setIsSyncing(true);

        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setUpdateBalance((prev) => !prev);
          }, 5000);
        }

        if (twoSecondsTimeoutRef.current) {
          clearTimeout(twoSecondsTimeoutRef.current);
          twoSecondsTimeoutRef.current = null;
        }

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }, 4000);
      };

      const handleSyncParsed = (data: { txid: string; internalizedCount: number }) => {
        if (!isMounted) return;
        if (data.internalizedCount > 0) {
          setFetchingTxid(data.txid);
          setShowQueueBanner(true);
          setIsSyncing(true);
        }
      };

      const handleSyncComplete = (data: { address: string }) => {
        if (!isMounted) return;
        setImportName(`Completed ${data.address}`);

        twoSecondsTimeoutRef.current = setTimeout(() => {
          setUpdateBalance(true);
          setIsSyncing(false);
          setShowQueueBanner(false);
          setFetchingTxid(undefined);
          setImportName(undefined);
        }, 3000);
      };

      wallet.on('sync:start', handleSyncStart);
      wallet.on('sync:parsed', handleSyncParsed);
      wallet.on('sync:complete', handleSyncComplete);
    };

    setupWalletListeners();

    // TODO: Investigate if chrome.runtime.onMessage is still needed for worker messages
    // chrome.runtime.onMessage.addListener(handleQueueStatusUpdate);

    return () => {
      isMounted = false;
      // chrome.runtime.onMessage.removeListener(handleQueueStatusUpdate);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (twoSecondsTimeoutRef.current) {
        clearTimeout(twoSecondsTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { queueLength, showQueueBanner, updateBalance, theme, isSyncing, importName, fetchingTxid };
};
