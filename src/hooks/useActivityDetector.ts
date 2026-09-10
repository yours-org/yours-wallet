import { useEffect, useRef } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';

/**
 * Persist activity at most this often. The shortest configurable lock timeout
 * is one minute, so a 15s-stale lastActiveTime can never lock an active user.
 * Writing on every mousemove hammered chrome.storage with concurrent writes.
 */
const ACTIVITY_WRITE_INTERVAL_MS = 15_000;

export const useActivityDetector = (
  isWalletLocked: boolean,
  isReady: boolean,
  chromeStorageService: ChromeStorageService,
) => {
  const lastWriteRef = useRef(0);

  useEffect(() => {
    const handleActivity = async () => {
      if (isWalletLocked || !isReady) return;

      const timestamp = Date.now();
      if (timestamp - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return;
      lastWriteRef.current = timestamp;
      await chromeStorageService.update({ lastActiveTime: timestamp });
    };

    document.addEventListener('mousemove', handleActivity);

    return () => {
      document.removeEventListener('mousemove', handleActivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWalletLocked, isReady]);
};
