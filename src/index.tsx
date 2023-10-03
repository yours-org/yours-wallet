import ReactDOM from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Buffer } from "buffer";
import process from "process";
import { WalletLockProvider } from "./contexts/WalletLockContext";
import { ThemeProvider } from "./contexts/ColorThemeContext";
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const root = document.createElement("div");
root.className = "container";
document.body.appendChild(root);
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <ThemeProvider>
    <WalletLockProvider>
      <App />
    </WalletLockProvider>
  </ThemeProvider>
);
