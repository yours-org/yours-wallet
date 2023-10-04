import React, { createContext, useState, useEffect, FC } from "react";
import { storage } from "../utils/storage";

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

export interface WalletLockContextProps {
  isLocked: boolean;
  setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
  lockWallet: () => void;
}

export const WalletLockContext = createContext<
  WalletLockContextProps | undefined
>(undefined);

interface WalletLockProviderProps {
  children: React.ReactNode;
}
export const WalletLockProvider: FC<WalletLockProviderProps> = (
  props: WalletLockProviderProps
) => {
  const { children } = props;
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const lockWallet = () => {
    const timestamp = Date.now();
    const twentyMinutesAgo = timestamp - 20 * 60 * 1000;
    storage.set({ lastActiveTime: twentyMinutesAgo });
    setIsLocked(true);
  };

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

    const interval = setInterval(checkLockState, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <WalletLockContext.Provider value={{ isLocked, setIsLocked, lockWallet }}>
      {children}
    </WalletLockContext.Provider>
  );
};
