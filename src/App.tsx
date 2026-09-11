/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useContext, useEffect } from 'react';
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom';
import { Show } from './components/Show';
import { UnlockWallet } from './components/UnlockWallet';
import { UsbGate } from './components/UsbGate';
import { UsbBackupPill } from './components/UsbBackupPill';
import { useUsbBackupRunner } from './hooks/useUsbBackupRunner';
import { BottomMenuContext } from './contexts/BottomMenuContext';
import { useActivityDetector } from './hooks/useActivityDetector';
import { useTheme } from './hooks/useTheme';
import { AppsAndTools } from './pages/AppsAndTools';
import { BsvWallet } from './pages/BsvWallet';
import { CreateAccount } from './pages/onboarding/CreateAccount';
import { ImportAccount } from './pages/onboarding/ImportAccount';
import { RestoreAccount } from './pages/onboarding/RestoreAccount';
import { Start } from './pages/onboarding/Start';
import { OrdWallet } from './pages/OrdWallet';
import { Settings } from './pages/Settings';
import { PageLoader } from './components/PageLoader';
import { useServiceContext } from './hooks/useServiceContext';
import { SyncingBlocks } from './components/SyncingBlocks';
import { MasterRestore } from './pages/onboarding/MasterRestore';
import { BlockHeightProvider } from './contexts/providers/BlockHeightProvider';
import { SyncProvider } from './contexts/providers/SyncProvider';
import { BottomMenuProvider } from './contexts/providers/BottomMenuProvider';
import { SnackbarProvider } from './contexts/providers/SnackbarProvider';
import { SweepMigration } from './pages/SweepMigration';

/** Mounted inside the USB gate so the backup loop only runs while a key reads. */
const UsbBackupRunner = () => {
  useUsbBackupRunner();
  return null;
};

export const App = () => {
  const { theme } = useTheme();
  const { isLocked, isReady, chromeStorageService, setIsLocked, isSwitchingAccount } = useServiceContext();
  const menuContext = useContext(BottomMenuContext);

  const walletBg = theme.color.global.walletBackground;

  useActivityDetector(isLocked, isReady, chromeStorageService);

  // Establish a port connection so the background knows the popup is open.
  // Port disconnects automatically when the popup closes — no timers needed.
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'extension-popup' });
    return () => port.disconnect();
  }, []);

  const handleUnlock = async () => {
    setIsLocked(false);
    menuContext?.handleSelect('bsv');
  };

  if (!isReady) {
    return (
      <div
        className="flex items-center justify-center relative p-0"
        style={{
          width: '24.5rem',
          height: '33.75rem',
          backgroundColor: walletBg,
        }}
      >
        <PageLoader message="Loading..." theme={theme} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center relative p-0"
      style={{
        width: '24.5rem',
        height: '33.75rem',
        backgroundColor: walletBg,
      }}
    >
      <BlockHeightProvider>
        <SyncProvider>
          <BottomMenuProvider>
            <div
              className="flex items-center justify-center w-full h-full relative"
              style={{ backgroundColor: walletBg }}
            >
              <SnackbarProvider>
                <SyncingBlocks />
                <Show when={!isLocked} whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}>
                  <UsbGate>
                    <UsbBackupRunner />
                    <UsbBackupPill />
                    <Show
                      when={!isSwitchingAccount}
                      whenFalseContent={<PageLoader message="Switching account..." theme={theme} />}
                    >
                      <Router>
                        <Routes>
                          <Route path="/" element={<Start />} />
                          <Route
                            path="/create-wallet"
                            element={<CreateAccount onNavigateBack={() => null} newWallet />}
                          />
                          <Route
                            path="/restore-wallet"
                            element={<RestoreAccount onNavigateBack={() => null} newWallet />}
                          />
                          <Route
                            path="/import-wallet"
                            element={<ImportAccount onNavigateBack={() => null} newWallet />}
                          />
                          <Route path="/master-restore" element={<MasterRestore />} />
                          <Route path="/sweep" element={<SweepMigration />} />
                          <Route path="/bsv-wallet" element={<BsvWallet />} />
                          <Route path="/ord-wallet" element={<OrdWallet />} />
                          <Route path="/tools" element={<AppsAndTools />} />
                          <Route path="/settings" element={<Settings />} />
                        </Routes>
                      </Router>
                    </Show>
                  </UsbGate>
                </Show>
              </SnackbarProvider>
            </div>
          </BottomMenuProvider>
        </SyncProvider>
      </BlockHeightProvider>
    </div>
  );
};
