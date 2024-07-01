import { Buffer } from 'buffer';
import process from 'process';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './contexts/ColorThemeContext';
import { WalletLockProvider } from './contexts/WalletLockContext';
import { Web3Provider } from './contexts/Web3Context';
import { Web3ProviderNew } from './contexts/Web3ContextNew';
import './index.css';
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const root = document.getElementById('root');
if (!root) throw new Error('Root element');
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <ThemeProvider>
    <WalletLockProvider>
      <Web3ProviderNew>
        <Web3Provider>
          <App />
        </Web3Provider>
      </Web3ProviderNew>
    </WalletLockProvider>
  </ThemeProvider>,
);
