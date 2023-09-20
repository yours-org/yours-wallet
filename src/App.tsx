import styled from "styled-components";
import { Start } from "./pages/onboarding/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { colors } from "./colors";
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

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22.5rem;
  height: 33.75rem;
  background-color: ${colors.navy};
  position: relative;
`;
export const App = () => {
  const { isLocked, setIsLocked } = useWalletLockState();

  useActivityDetector(isLocked);

  return (
    <Container>
      <SnackbarProvider>
        <Show
          when={!isLocked}
          whenFalseContent={
            <UnlockWallet onUnlock={() => setIsLocked(false)} />
          }
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
