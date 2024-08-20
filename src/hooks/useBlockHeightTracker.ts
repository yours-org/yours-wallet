import { useEffect, useState } from 'react';
import { YoursEventName } from '../inject';

export type BlockHeightTrackerMessage = {
  action: YoursEventName.BLOCK_HEIGHT_UPDATE;
  data: { currentHeight: number; lastHeight: number };
};

export const useBlockHeightTracker = () => {
  const [percentCompleted, setPercentageComplete] = useState(0);
  const [showSyncPage, setShowSyncPage] = useState(false);

  useEffect(() => {
    const handleBlockHeightUpdate = (message: BlockHeightTrackerMessage) => {
      if (message.action === YoursEventName.BLOCK_HEIGHT_UPDATE) {
        setShowSyncPage(true);
        const percent = Math.round((message.data.lastHeight / message.data.currentHeight) * 100);
        setPercentageComplete(percent);
        if (percent >= 100) {
          setShowSyncPage(false);
        }
      }
    };

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener(handleBlockHeightUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { percentCompleted, showSyncPage };
};
