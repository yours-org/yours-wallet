import { useState, useEffect } from "react";
import { storage } from "../utils/storage";

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

export const useWalletLockState = () => {
  const [isLocked, setIsLocked] = useState<boolean>(false);

  useEffect(() => {
    const checkLockState = () => {
      storage.get(["lastActiveTime", "encryptedKeys"], (result) => {
        const currentTime = Date.now();
        const lastActiveTime = result.lastActiveTime;

        if (!result.encryptedKeys) {
          setIsLocked(false);
          return;
        }

        if (currentTime - lastActiveTime > INACTIVITY_LIMIT) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }
      });
    };

    checkLockState();

    // Set an interval to check the lock state regularly
    const interval = setInterval(checkLockState, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return { isLocked, setIsLocked };
};
