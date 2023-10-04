import styled from "styled-components";
import { Start } from "./pages/onboarding/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { ColorThemeProps } from "./theme";
import { CreateWallet } from "./pages/onboarding/CreateWallet";
import { Settings } from "./pages/Settings";
import { BsvWallet } from "./pages/BsvWallet";
import { OrdWallet } from "./pages/OrdWallet";
import { RestoreWallet } from "./pages/onboarding/RestoreWallet";
import { useActivityDetector } from "./hooks/useActivityDetector";
import { Show } from "./components/Show";
import { UnlockWallet } from "./components/UnlockWallet";
import { useWalletLockState } from "./hooks/useWalletLockState";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { useTheme } from "./hooks/useTheme";
import { BsvSendRequest } from "./pages/BsvSendRequest";
import { storage } from "./utils/storage";
import { useContext, useEffect, useState } from "react";
import { Web3SendBsvRequest } from "./hooks/useBsv";
import { Web3TransferOrdinalRequest } from "./hooks/useOrds";
import { OrdTransferRequest } from "./pages/OrdTransferRequest";
import { BottomMenuContext } from "./contexts/BottomMenuContext";

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.mainBackground};
  position: relative;
`;
export const App = () => {
  const { isLocked, setIsLocked } = useWalletLockState();
  const { theme } = useTheme();
  const menuContext = useContext(BottomMenuContext);

  const [bsvSendRequest, setBsvSendRequest] = useState<
    Web3SendBsvRequest | undefined
  >(undefined);

  const [ordinalTransferRequest, setOrdinalTransferRequest] = useState<
    Web3TransferOrdinalRequest | undefined
  >(undefined);

  useActivityDetector(isLocked);

  const handleUnlock = async () => {
    if (chrome.runtime) {
      await chrome.runtime.sendMessage({
        action: "userDecision",
        decision: "confirmed",
      });
    }

    setIsLocked(false);
  };

  useEffect(() => {
    storage.get(["sendBsv", "transferOrdinal"], (result) => {
      if (result.sendBsv) {
        setBsvSendRequest(result.sendBsv);
      }

      if (result.transferOrdinal) {
        setOrdinalTransferRequest(result.transferOrdinal);
        menuContext?.handleSelect("ords");
      }
    });
  }, [menuContext]);

  return (
    <Container theme={theme}>
      <SnackbarProvider>
        <Show
          when={!isLocked}
          whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}
        >
          <Router>
            <Routes>
              <Route path="/" element={<Start />} />
              <Route path="/create-wallet" element={<CreateWallet />} />
              <Route path="/restore-wallet" element={<RestoreWallet />} />
              <Route
                path="/bsv-wallet"
                element={
                  <Show
                    when={!!bsvSendRequest}
                    whenFalseContent={<BsvWallet />}
                  >
                    <BsvSendRequest
                      web3Request={bsvSendRequest as Web3SendBsvRequest}
                      onResponse={() => setBsvSendRequest(undefined)}
                    />
                  </Show>
                }
              />
              <Route
                path="/ord-wallet"
                element={
                  <Show
                    when={!!ordinalTransferRequest}
                    whenFalseContent={<OrdWallet />}
                  >
                    <OrdTransferRequest
                      web3Request={
                        ordinalTransferRequest as Web3TransferOrdinalRequest
                      }
                      onResponse={() => setOrdinalTransferRequest(undefined)}
                    />
                  </Show>
                }
              />
              <Route path="/ord-wallet" element={<OrdWallet />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Router>
        </Show>
      </SnackbarProvider>
    </Container>
  );
};
