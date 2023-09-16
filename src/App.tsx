import styled from "styled-components";
import { Start } from "./pages/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { colors } from "./colors";
import { CreateWallet } from "./pages/CreateWallet";
import { SnackbarProvider } from "./contexts/SnackbarContext";

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21.875rem;
  height: 31.25rem;
  background-color: ${colors.navy};
  position: relative;
`;
export const App = () => {
  return (
    <Container>
      <SnackbarProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Start />} />
            <Route path="/create-wallet" element={<CreateWallet />} />
            <Route path="/wallet" element={<div>My Wallet</div>} />
          </Routes>
        </Router>
      </SnackbarProvider>
    </Container>
  );
};
