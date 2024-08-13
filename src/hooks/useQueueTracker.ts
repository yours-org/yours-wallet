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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQueueStatusUpdate = (message: QueueTrackerMessage) => {
      if (message.action === YoursEventName.QUEUE_STATUS_UPDATE) {
        console.log('Queue Status Update:', message.data);

        // Update the queue length state
        setQueueLength(message.data.length);

        // Set the state to true as we're receiving updates
        updateShowQueueBanner(true);

        // Clear the existing timeout, if any
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          updateShowQueueBanner(false);
        }, 3000);
      }
    };

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener(handleQueueStatusUpdate);

    return () => {
      // Clean up the listener and the timeout when the component unmounts
      chrome.runtime.onMessage.removeListener(handleQueueStatusUpdate);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { queueLength, showQueueBanner, theme };
};
