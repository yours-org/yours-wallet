import { useContext } from "react";
import {
  WalletLockContext,
  WalletLockContextProps,
} from "../contexts/WalletLockContext";

export const useWalletLockState = (): WalletLockContextProps => {
  const context = useContext(WalletLockContext);
  if (!context) {
    throw new Error(
      "useWalletLockState must be used within a WalletLockProvider"
    );
  }
  return context;
};
