import { Buffer } from 'buffer';
import process from 'process';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './contexts/ColorThemeContext';
import { ServiceProvider } from './contexts/ServiceContext';
import { Web3RequestProvider } from './contexts/Web3RequestContext';
import './index.css';
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const root = document.getElementById('root');
if (!root) throw new Error('Root element');
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <Web3RequestProvider>
    <ServiceProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ServiceProvider>
  </Web3RequestProvider>,
);
