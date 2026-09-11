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
import { getHandle, requestHandlePermission } from './services/UsbKey.service';
import { enforceUsbPresence, type UsbPresence } from './services/usbPresence';
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
  | { kind: 'oneSatPermission'; requestID: string; payload: OneSatPromptStorageEntry }
  /** USB key security is on and no registered stick reads: hold the request until one does. */
  | { kind: 'usbAbsent'; presence: UsbPresence; pending: PendingRequest };

type PendingRequest = Extract<
  PromptScreen,
  { kind: 'permission' | 'groupedPermission' | 'counterpartyPermission' | 'oneSatPermission' }
>;

const WAITING_CLOSE_MS = 10000;
const EXPIRED_CLOSE_MS = 2000;
const USB_RECHECK_MS = 2000;

const PromptApp = () => {
  const { theme } = useTheme();
  const { isLocked, isReady, chromeStorageService, lockWallet } = useServiceContext();
  const [screen, setScreen] = useState<PromptScreen>({ kind: 'loading' });
  const waitingTimer = useRef<number | undefined>(undefined);
  const advanceRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const clearWaitingTimer = () => {
    if (waitingTimer.current !== undefined) {
      window.clearTimeout(waitingTimer.current);
      waitingTimer.current = undefined;
    }
  };

  /** Two consecutive misses while a request is held: the stick was pulled, so lock. */
  const onUsbRemoved = useCallback(() => {
    setScreen({ kind: 'unlock' });
    void lockWallet();
  }, [lockWallet]);

  /**
   * Gate a fetched request on USB presence. With the feature off this is a
   * no-op. The request is never answered or closed while we wait.
   */
  const gateOnUsb = useCallback(
    async (pending: PendingRequest) => {
      const presence = await enforceUsbPresence(chromeStorageService, onUsbRemoved);
      if (presence === 'present' || presence === 'disabled') setScreen(pending);
      else setScreen({ kind: 'usbAbsent', presence, pending });
    },
    [chromeStorageService, onUsbRemoved],
  );

  const loadPrompt = useCallback(
    async (kind: PromptKind, requestID: string) => {
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
        await gateOnUsb({ kind, requestID, payload: res.data } as PendingRequest);
      } else {
        setScreen({ kind: 'expired' });
        window.setTimeout(() => void advanceRef.current?.(), EXPIRED_CLOSE_MS);
      }
    },
    [gateOnUsb],
  );

  // While a request is held for the USB key, re-check every couple of seconds
  // and render it as soon as a registered stick reads.
  useEffect(() => {
    if (screen.kind !== 'usbAbsent') return;
    const { pending } = screen;
    let cancelled = false;
    const tick = async () => {
      const presence = await enforceUsbPresence(chromeStorageService, onUsbRemoved);
      if (cancelled) return;
      if (presence === 'present' || presence === 'disabled') setScreen(pending);
      else
        setScreen((prev) => (prev.kind === 'usbAbsent' && prev.presence !== presence ? { ...prev, presence } : prev));
    };
    const timer = window.setInterval(() => void tick(), USB_RECHECK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [screen, chromeStorageService, onUsbRemoved]);

  /** Needs a user gesture: Chrome shows a permission bubble for each saved handle. */
  const allowUsbAccess = async () => {
    if (screen.kind !== 'usbAbsent') return;
    const usb = chromeStorageService.getUsbSecurity();
    for (const stick of usb?.sticks ?? []) {
      const handle = await getHandle(stick.id);
      if (handle) await requestHandlePermission(handle);
    }
    const presence = await enforceUsbPresence(chromeStorageService, onUsbRemoved);
    if (presence === 'present' || presence === 'disabled') setScreen(screen.pending);
    else setScreen({ ...screen, presence });
  };

  /**
   * Ask the background to close this window. It closes only if nothing is
   * pending at that instant; otherwise it returns the prompt to render next.
   * The window never calls window.close() itself while the background is
   * reachable, because the background treats an unexplained close as the
   * user dismissing every pending prompt.
   */
  const requestClose = useCallback(async () => {
    clearWaitingTimer();
    let res: { success: boolean; data?: { prompt?: { kind: PromptKind; requestID?: string } } } | undefined;
    try {
      res = await sendMessageAsync<{ success: boolean; data?: { prompt?: { kind: PromptKind; requestID?: string } } }>({
        action: 'CLOSE_PROMPT_WINDOW',
      });
    } catch {
      res = undefined;
    }
    if (res === undefined) {
      // Background unreachable (e.g. service worker gone): nothing to deny.
      window.close();
      return;
    }
    const next = res.data?.prompt;
    if (!next) return; // background is closing us
    if (next.kind === 'unlock') setScreen({ kind: 'unlock' });
    else if (next.requestID) await loadPrompt(next.kind, next.requestID);
  }, [loadPrompt]);

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
      waitingTimer.current = window.setTimeout(() => void requestClose(), WAITING_CLOSE_MS);
      return;
    }
    await requestClose();
  }, [loadPrompt, requestClose]);

  advanceRef.current = advance;

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
        {screen.kind === 'usbAbsent' && (
          <div className="flex flex-col items-center gap-3 px-8 text-center">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: theme.color.global.gray }} />
            <p className="text-sm font-semibold" style={{ color: theme.color.global.contrast }}>
              Insert your USB key to continue
            </p>
            <p className="text-xs" style={{ color: theme.color.global.gray }}>
              This request will open as soon as a registered USB key is detected.
            </p>
            {screen.presence === 'permission' && (
              <button
                type="button"
                onClick={() => void allowUsbAccess()}
                className="text-xs underline underline-offset-2 bg-transparent border-none p-0 cursor-pointer"
                style={{ color: theme.color.global.gray, fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
              >
                Plugged in but not detected? Check again
              </button>
            )}
          </div>
        )}
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
