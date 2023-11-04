import { Buffer } from 'buffer';
import process from 'process';
import ReactDOM from 'react-dom/client';
import { styled } from 'styled-components';
import { App } from './App';
import { BottomMenuProvider } from './contexts/BottomMenuContext';
import { ThemeProvider } from './contexts/ColorThemeContext';
import { WalletLockProvider } from './contexts/WalletLockContext';
import { Web3Provider } from './contexts/Web3Context';
import './index.css';
import { ColorThemeProps } from './theme';
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh
  position: relative;
`;

const root = document.createElement('div');
root.className = 'container';
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
  </ThemeProvider>,
);
