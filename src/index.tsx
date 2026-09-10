import { Buffer } from 'buffer';
import process from 'process';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ServiceProvider } from './contexts/providers/ServiceProvider';
import { ThemeProvider } from './contexts/providers/ThemeProvider';
import './index.css';
global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const root = document.getElementById('root');
if (!root) throw new Error('Root element');
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <ServiceProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ServiceProvider>,
);
