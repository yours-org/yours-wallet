import { Buffer } from 'buffer';
import process from 'process';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type {
  CounterpartyPermissionRequest,
  GroupedPermissionRequest,
  PermissionRequest,
} from '@bsv/wallet-toolbox-client';
import { UnlockWallet } from './components/UnlockWallet';
import { PageLoader } from './components/PageLoader';
import { BottomMenuProvider } from './contexts/providers/BottomMenuProvider';
import { ServiceProvider } from './contexts/providers/ServiceProvider';
import { SnackbarProvider } from './contexts/providers/SnackbarProvider';
import { ThemeProvider } from './contexts/providers/ThemeProvider';
import { useServiceContext } from './hooks/useServiceContext';
import { useTheme } from './hooks/useTheme';
import { CounterpartyPermissionRequestPage } from './pages/requests/CounterpartyPermissionRequest';
import { GroupedPermissionRequestPage } from './pages/requests/GroupedPermissionRequest';
import { OneSatPermissionRequestPage } from './pages/requests/OneSatPermissionRequest';
import { PermissionRequestPage } from './pages/requests/PermissionRequest';
import type { OneSatPromptStorageEntry } from './services/oneSatPrompt';
import { sendMessageAsync } from './utils/chromeHelpers';
import type { PromptKind } from './promptProtocol';
import './index.css';

global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

type PromptScreen =
  | { kind: 'loading' }
  | { kind: 'expired' }
  | { kind: 'waiting' }
  | { kind: 'unlock' }
  | { kind: 'permission'; requestID: string; payload: PermissionRequest & { requestID: string } }
  | { kind: 'groupedPermission'; requestID: string; payload: GroupedPermissionRequest }
  | { kind: 'counterpartyPermission'; requestID: string; payload: CounterpartyPermissionRequest }
  | { kind: 'oneSatPermission'; requestID: string; payload: OneSatPromptStorageEntry };

const WAITING_CLOSE_MS = 10000;
const EXPIRED_CLOSE_MS = 2000;

const PromptApp = () => {
  const { theme } = useTheme();
  const { isLocked, isReady } = useServiceContext();
  const [screen, setScreen] = useState<PromptScreen>({ kind: 'loading' });
  const waitingTimer = useRef<number | undefined>(undefined);

  const clearWaitingTimer = () => {
    if (waitingTimer.current !== undefined) {
      window.clearTimeout(waitingTimer.current);
      waitingTimer.current = undefined;
    }
  };

  const loadPrompt = useCallback(async (kind: PromptKind, requestID: string) => {
    clearWaitingTimer();
    setScreen({ kind: 'loading' });
    let res: { success: boolean; data?: unknown } | undefined;
    try {
      res = await sendMessageAsync<{ success: boolean; data?: unknown }>({
        action: 'GET_PROMPT_PAYLOAD',
        kind,
        requestID,
      });
    } catch {
      res = undefined;
    }
    if (res?.success && res.data) {
      setScreen({ kind, requestID, payload: res.data } as PromptScreen);
    } else {
      setScreen({ kind: 'expired' });
      window.setTimeout(() => window.close(), EXPIRED_CLOSE_MS);
    }
  }, []);

  const advance = useCallback(async () => {
    clearWaitingTimer();
    let res:
      | { success: boolean; data?: { prompt?: { kind: PromptKind; requestID: string }; busy?: boolean } }
      | undefined;
    try {
      res = await sendMessageAsync<{
        success: boolean;
        data?: { prompt?: { kind: PromptKind; requestID: string }; busy?: boolean };
      }>({
        action: 'GET_NEXT_PROMPT',
      });
    } catch {
      res = undefined;
    }
    if (res?.data?.prompt) {
      await loadPrompt(res.data.prompt.kind, res.data.prompt.requestID);
      return;
    }
    if (res?.data?.busy) {
      setScreen({ kind: 'waiting' });
      waitingTimer.current = window.setTimeout(() => window.close(), WAITING_CLOSE_MS);
      return;
    }
    window.close();
  }, [loadPrompt]);

  useEffect(() => {
    if (!isReady) return;
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('kind') as PromptKind | null;
    const requestID = params.get('requestID');
    if (kind === 'unlock') {
      if (isLocked) setScreen({ kind: 'unlock' });
      else void advance();
      return;
    }
    if (kind && requestID) {
      void loadPrompt(kind, requestID);
      return;
    }
    void advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  useEffect(() => {
    const listener = (message: { action?: string; kind?: PromptKind; requestID?: string }) => {
      if (message?.action !== 'SHOW_PROMPT' || !message.kind) return;
      if (message.kind === 'unlock') {
        clearWaitingTimer();
        setScreen({ kind: 'unlock' });
        return;
      }
      if (message.requestID) void loadPrompt(message.kind, message.requestID);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [loadPrompt]);

  const walletBg = theme.color.global.walletBackground;

  return (
    <MemoryRouter>
      <div
        className="flex items-center justify-center relative p-0"
        style={{ width: '24.5rem', height: '33.75rem', backgroundColor: walletBg }}
      >
        {(!isReady || screen.kind === 'loading') && <PageLoader message="Loading..." theme={theme} />}
        {screen.kind === 'waiting' && <PageLoader message="Waiting for request..." theme={theme} />}
        {screen.kind === 'expired' && (
          <p className="text-xs" style={{ color: theme.color.global.gray }}>
            This request expired or was already handled.
          </p>
        )}
        {screen.kind === 'unlock' && <UnlockWallet onUnlock={() => void advance()} />}
        {screen.kind === 'permission' && (
          <PermissionRequestPage request={screen.payload} onResponse={() => void advance()} />
        )}
        {screen.kind === 'groupedPermission' && (
          <GroupedPermissionRequestPage request={screen.payload} onResponse={() => void advance()} />
        )}
        {screen.kind === 'counterpartyPermission' && (
          <CounterpartyPermissionRequestPage request={screen.payload} onResponse={() => void advance()} />
        )}
        {screen.kind === 'oneSatPermission' && (
          <OneSatPermissionRequestPage request={screen.payload} onResponse={() => void advance()} />
        )}
      </div>
    </MemoryRouter>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Root element');
ReactDOM.createRoot(root).render(
  <ServiceProvider>
    <ThemeProvider>
      <BottomMenuProvider>
        <SnackbarProvider>
          <PromptApp />
        </SnackbarProvider>
      </BottomMenuProvider>
    </ThemeProvider>
  </ServiceProvider>,
);
