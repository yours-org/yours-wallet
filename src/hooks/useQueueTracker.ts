import { useEffect, useState, useRef } from 'react';
import { YoursEventName } from '../inject';
import { useTheme } from './useTheme';

export type QueueTrackerMessage = {
  action: YoursEventName.QUEUE_STATUS_UPDATE;
  data: { length: number };
};

export const useQueueTracker = () => {
  const { theme } = useTheme();
  const [queueLength, setQueueLength] = useState(0);
  const [showQueueBanner, setShowQueueBanner] = useState(false);
  const [updateBalance, setUpdateBalance] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQueueStatusUpdate = (message: QueueTrackerMessage) => {
      if (message.action === YoursEventName.QUEUE_STATUS_UPDATE) {
        setQueueLength(message.data.length);
        setShowQueueBanner(true);
        setIsSyncing(true);

        // Start the toggle mechanism for updating the balance
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setUpdateBalance((prev) => !prev);
          }, 5000);
        }

        // Reset the timeout whenever a new event is received
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Hide the banner after 5 seconds if no new events and indicate syncing is done
        timeoutRef.current = setTimeout(() => {
          setShowQueueBanner(false);
          setIsSyncing(false);

          // Clear the interval and stop updating the balance after sync is complete
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          setUpdateBalance(true);
        }, 5000);
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
    };
  }, []);

  return { queueLength, showQueueBanner, updateBalance, theme, isSyncing };
};
