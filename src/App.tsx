import styled from "styled-components";
import { Start } from "./pages/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { colors } from "./colors";
import { CreateWallet } from "./pages/CreateWallet";

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
      <Router>
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/create-wallet" element={<CreateWallet />} />
        </Routes>
      </Router>
    </Container>
  );
};
