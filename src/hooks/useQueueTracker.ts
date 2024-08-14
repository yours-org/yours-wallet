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
  const [showQueueBanner, updateShowQueueBanner] = useState(false);
  const [updateBalance, setUpdateBalance] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQueueStatusUpdate = (message: QueueTrackerMessage) => {
      if (message.action === YoursEventName.QUEUE_STATUS_UPDATE) {
        setQueueLength(message.data.length);
        updateShowQueueBanner(true);

        // Start the toggle mechanism for updating the balance
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setUpdateBalance((prev) => !prev);
          }, 2000);
        }

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          updateShowQueueBanner(false);

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          setUpdateBalance(false);
        }, 3000);
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

  return { queueLength, showQueueBanner, updateBalance, theme };
};
