import styled from "styled-components";
import { Start } from "./pages/onboarding/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { ColorThemeProps, Theme, defaultTheme } from "./theme";
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
import { ThemeProvider } from "./contexts/ColorThemeContext";

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
  const userTheme: Theme = false || defaultTheme; // TODO: In place of false, we need to call or look for a specific inscription pattern and set the user theme

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
    <ThemeProvider userTheme={userTheme}>
      <Container theme={userTheme}>
        <SnackbarProvider theme={userTheme}>
          <Show
            when={!isLocked}
            whenFalseContent={
              <UnlockWallet theme={userTheme} onUnlock={handleUnlock} />
            }
          >
            <BottomMenuProvider theme={userTheme}>
              <Router>
                <Routes>
                  <Route path="/" element={<Start theme={userTheme} />} />
                  <Route
                    path="/create-wallet"
                    element={<CreateWallet theme={userTheme} />}
                  />
                  <Route
                    path="/restore-wallet"
                    element={<RestoreWallet theme={userTheme} />}
                  />
                  <Route
                    path="/bsv-wallet"
                    element={<BsvWallet theme={userTheme} />}
                  />
                  <Route
                    path="/ord-wallet"
                    element={<OrdWallet theme={userTheme} />}
                  />
                  <Route
                    path="/settings"
                    element={<Settings theme={userTheme} />}
                  />
                </Routes>
              </Router>
            </BottomMenuProvider>
          </Show>
        </SnackbarProvider>
      </Container>
    </ThemeProvider>
  );
};
