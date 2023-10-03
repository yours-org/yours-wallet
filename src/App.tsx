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
import { BottomMenuProvider } from "./contexts/BottomMenuContext";
import { useWalletLockState } from "./hooks/useWalletLockState";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { useTheme } from "./hooks/useTheme";

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22.5rem;
  height: 33.75rem;
  background-color: ${({ theme }) => theme.mainBackground};
  position: relative;
`;
export const App = () => {
  const { isLocked, setIsLocked } = useWalletLockState();
  const { theme } = useTheme();

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

  return (
    <Container theme={theme}>
      <SnackbarProvider>
        <Show
          when={!isLocked}
          whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}
        >
          <BottomMenuProvider>
            <Router>
              <Routes>
                <Route path="/" element={<Start />} />
                <Route path="/create-wallet" element={<CreateWallet />} />
                <Route path="/restore-wallet" element={<RestoreWallet />} />
                <Route path="/bsv-wallet" element={<BsvWallet />} />
                <Route path="/ord-wallet" element={<OrdWallet />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Router>
          </BottomMenuProvider>
        </Show>
      </SnackbarProvider>
    </Container>
  );
};
