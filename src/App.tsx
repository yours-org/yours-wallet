import styled from "styled-components";
import { Start } from "./pages/onboarding/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { colors } from "./colors";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { CreateWallet } from "./pages/onboarding/CreateWallet";
import { BottomMenuProvider } from "./contexts/BottomMenuContext";
import { Settings } from "./pages/Settings";
import { BsvWallet } from "./pages/BsvWallet";
import { OrdWallet } from "./pages/OrdWallet";

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
  return (
    <Container>
      <SnackbarProvider>
        <BottomMenuProvider>
          <Router>
            <Routes>
              <Route path="/" element={<Start />} />
              <Route path="/create-wallet" element={<CreateWallet />} />
              <Route path="/bsv-wallet" element={<BsvWallet />} />
              <Route path="/ord-wallet" element={<OrdWallet />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Router>
        </BottomMenuProvider>
      </SnackbarProvider>
    </Container>
  );
};
