import ReactDOM from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Buffer } from "buffer";
import process from "process";
import { WalletLockProvider } from "./contexts/WalletLockContext";
import { ThemeProvider } from "./contexts/ColorThemeContext";
import { Web3Provider } from "./contexts/Web3Context";
import { BottomMenuProvider } from "./contexts/BottomMenuContext";
import { styled } from "styled-components";
import { ColorThemeProps } from "./theme";
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22.5rem;
  height: 33.75rem;
  position: relative;
`;

const root = document.createElement("div");
root.className = "container";
document.body.appendChild(root);
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <ThemeProvider>
    <WalletLockProvider>
      <Web3Provider>
        <Container>
          <BottomMenuProvider>
            <App />
          </BottomMenuProvider>
        </Container>
      </Web3Provider>
    </WalletLockProvider>
  </ThemeProvider>
);
