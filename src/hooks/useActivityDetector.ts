import { useEffect } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';

export const useActivityDetector = (
  isWalletLocked: boolean,
  isReady: boolean,
  chromeStorageService: ChromeStorageService,
) => {
  useEffect(() => {
    const handleActivity = async () => {
      if (isWalletLocked || !isReady) return;

      const timestamp = Date.now();
      await chromeStorageService.update({ lastActiveTime: timestamp });
    };

    document.addEventListener('mousemove', handleActivity);

    return () => {
      document.removeEventListener('mousemove', handleActivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWalletLocked, isReady]);
};
