import { useEffect, useState, useRef } from 'react';
import { YoursEventName } from '../inject';
import { useTheme } from './useTheme';

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

export type SignedOutMessage = {
  action: YoursEventName.SIGNED_OUT;
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
    const handleQueueStatusUpdate = (message: QueueTrackerMessage | ImportTrackerMessage | FetchingMessage | SignedOutMessage) => {
      // Handle sign out - reset all sync state
      if (message.action === YoursEventName.SIGNED_OUT) {
        setQueueLength(0);
        setShowQueueBanner(false);
        setIsSyncing(false);
        setImportName(undefined);
        setFetchingTxid(undefined);

        // Clear all timeouts and intervals
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (twoSecondsTimeoutRef.current) {
          clearTimeout(twoSecondsTimeoutRef.current);
          twoSecondsTimeoutRef.current = null;
        }

        // Clear localStorage
        localStorage.removeItem('walletImporting');
        return;
      }

      if (
        message.action === YoursEventName.QUEUE_STATUS_UPDATE ||
        message.action === YoursEventName.IMPORT_STATUS_UPDATE ||
        message.action === YoursEventName.FETCHING_TX_STATUS_UPDATE
      ) {
        const importName = (message as ImportTrackerMessage).data.name;
        if (importName) {
          setImportName(importName);
        } else {
          setImportName(undefined);
        }

        const fetchingTxid = (message as FetchingMessage).data.txid;
        if (fetchingTxid) {
          setFetchingTxid(fetchingTxid);
        }

        const queueLength = (message as QueueTrackerMessage).data.length;
        queueLength && setQueueLength(queueLength);
        setShowQueueBanner(true);
        setIsSyncing(true);

        // Start the toggle mechanism for updating the balance
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setUpdateBalance((prev) => !prev);
          }, 5000);
        }

        // Clear the 2-second timeout if a new event is received
        if (twoSecondsTimeoutRef.current) {
          clearTimeout(twoSecondsTimeoutRef.current);
          twoSecondsTimeoutRef.current = null;
        }

        if (queueLength === 0) {
          // Set a timeout to delay setting isSyncing to false
          twoSecondsTimeoutRef.current = setTimeout(() => {
            setUpdateBalance(true);
            setIsSyncing(false);
            setShowQueueBanner(false);
            setFetchingTxid(undefined);
          }, 3000);
        }

        // Reset the hide banner timeout whenever a new event is received
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          // Clear the interval and stop updating after sync is complete
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }, 4000);
      }
    };

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener(handleQueueStatusUpdate);

    return () => {
      chrome.runtime.onMessage.removeListener(handleQueueStatusUpdate);
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
