import { Buffer } from 'buffer';
import process from 'process';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { BottomMenuProvider } from './contexts/providers/BottomMenuProvider';
import { ServiceProvider } from './contexts/providers/ServiceProvider';
import { SnackbarProvider } from './contexts/providers/SnackbarProvider';
import { ThemeProvider } from './contexts/providers/ThemeProvider';
import { UsbFlow } from './pages/usb/UsbFlow';
import './index.css';
import './pages/usb/usb.css';

global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

// The background worker idles out after ~30s without events and its startup
// path would otherwise treat this window as an orphan. A ping every 20s keeps
// it alive for as long as the flow is open.
const ping = () => chrome.runtime.sendMessage({ action: 'USB_PING' }).catch(() => {});
ping();
window.setInterval(ping, 20_000);

const root = document.getElementById('root');
if (!root) throw new Error('Root element');
ReactDOM.createRoot(root).render(
  <ServiceProvider>
    <ThemeProvider>
      <BottomMenuProvider>
        <SnackbarProvider>
          <MemoryRouter>
            <UsbFlow />
          </MemoryRouter>
        </SnackbarProvider>
      </BottomMenuProvider>
    </ThemeProvider>
  </ServiceProvider>,
);
