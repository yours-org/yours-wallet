import React, { createContext, useEffect, FC } from "react";
import { storage } from "../utils/storage";
import { useWalletLockState } from "../hooks/useWalletLockState";
import { useBsv } from "../hooks/useBsv";
import { useOrds } from "../hooks/useOrds";

export const Web3Context = createContext(undefined);

interface Web3ProviderProps {
  children: React.ReactNode;
}
export const Web3Provider: FC<Web3ProviderProps> = (
  props: Web3ProviderProps
) => {
  const { children } = props;
  const { isLocked } = useWalletLockState();
  const { bsvAddress } = useBsv();
  const { ordAddress, ordinals } = useOrds();

  useEffect(() => {
    if (isLocked) {
      storage.remove("appState");
      return;
    }
    storage.set({ appState: { isLocked, bsvAddress, ordAddress, ordinals } });
  }, [isLocked, bsvAddress, ordAddress, ordinals]);

  return (
    <Web3Context.Provider value={undefined}>{children}</Web3Context.Provider>
  );
};
