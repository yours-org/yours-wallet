import { useEffect } from 'react';
import { storage } from '../utils/storage';

export const useActivityDetector = (isWalletLocked: boolean) => {
  useEffect(() => {
    const handleActivity = async () => {
      if (isWalletLocked) return;

      const timestamp = Date.now();
      await storage.set({ lastActiveTime: timestamp });
    };

    document.addEventListener('mousemove', handleActivity);

    return () => {
      document.removeEventListener('mousemove', handleActivity);
    };
  }, [isWalletLocked]);
};
