/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useContext, useEffect, useState } from 'react';
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';
import { Show } from './components/Show';
import { UnlockWallet } from './components/UnlockWallet';
import { BottomMenuContext } from './contexts/BottomMenuContext';
import { useActivityDetector } from './hooks/useActivityDetector';
import { useTheme } from './hooks/useTheme';
import { useViewport } from './hooks/useViewport';
import { AppsAndTools } from './pages/AppsAndTools';
import { BsvWallet } from './pages/BsvWallet';
import { CreateAccount } from './pages/onboarding/CreateAccount';
import { ImportAccount } from './pages/onboarding/ImportAccount';
import { RestoreAccount } from './pages/onboarding/RestoreAccount';
import { Start } from './pages/onboarding/Start';
import { OrdWallet } from './pages/OrdWallet';
import { BsvSendRequest } from './pages/requests/BsvSendRequest';
import { ConnectRequest } from './pages/requests/ConnectRequest';
import { SignMessageRequest } from './pages/requests/SignMessageRequest';
import { Settings } from './pages/Settings';
import { WhiteLabelTheme } from './theme.types';
import { WhitelistedApp } from './inject';
import { PageLoader } from './components/PageLoader';
import { useServiceContext } from './hooks/useServiceContext';
import { useWeb3RequestContext } from './hooks/useWeb3RequestContext';
import { SyncBanner } from './components/SyncBanner';
import { SyncingBlocks } from './components/SyncingBlocks';
import { MasterRestore } from './pages/onboarding/MasterRestore';
import { BlockHeightProvider } from './contexts/providers/BlockHeightProvider';
import { SyncProvider } from './contexts/providers/SyncProvider';
import { BottomMenuProvider } from './contexts/providers/BottomMenuProvider';
import { SnackbarProvider } from './contexts/providers/SnackbarProvider';
import { MNEESendRequest } from './pages/requests/MNEESendRequest';
import { PermissionRequestPage } from './pages/requests/PermissionRequest';
import { TransactionApprovalRequest } from './pages/requests/TransactionApprovalRequest';

const MainContainer = styled.div<WhiteLabelTheme & { $isMobile?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $isMobile }) => ($isMobile ? '100vw' : '24.5rem')};
  height: ${({ $isMobile }) => ($isMobile ? '100vh' : '33.75rem')};
  position: relative;
  padding: 0;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
`;

const Container = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  position: relative;
`;

export const App = () => {
  const { isMobile } = useViewport();
  const { theme } = useTheme();
  const { isLocked, isReady, chromeStorageService, setIsLocked } = useServiceContext();
  const menuContext = useContext(BottomMenuContext);
  const {
    connectRequest,
    sendBsvRequest,
    sendMNEERequest,
    signMessageRequest,
    permissionRequest,
    transactionApprovalRequest,
    clearRequest,
    popupId,
    getStorageAndSetRequestState,
  } = useWeb3RequestContext();
  const [whitelistedApps, setWhitelistedApps] = useState<WhitelistedApp[]>([]);

  useEffect(() => {
    if (isReady) {
      const { account } = chromeStorageService.getCurrentAccountObject();
      setWhitelistedApps(account?.settings?.whitelist ?? []);
    }
  }, [chromeStorageService, isReady]);

  useActivityDetector(isLocked, isReady, chromeStorageService);

  useEffect(() => {
    isReady && getStorageAndSetRequestState(chromeStorageService);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const handleUnlock = async () => {
    setIsLocked(false);
    menuContext?.handleSelect('bsv');
  };

  if (!isReady) {
    return (
      <MainContainer $isMobile={isMobile} theme={theme}>
        <PageLoader message="Loading..." theme={theme} />
      </MainContainer>
    );
  }

  return (
    <MainContainer $isMobile={isMobile} theme={theme}>
      <BlockHeightProvider>
        <SyncProvider>
          <BottomMenuProvider network={chromeStorageService.getNetwork()}>
            <Container theme={theme}>
              <SnackbarProvider>
                <SyncBanner />
                <SyncingBlocks />
                <Show when={!isLocked} whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}>
                  <Router>
                    <Routes>
                      <Route path="/" element={<Start />} />
                      <Route path="/create-wallet" element={<CreateAccount onNavigateBack={() => null} newWallet />} />
                      <Route
                        path="/restore-wallet"
                        element={<RestoreAccount onNavigateBack={() => null} newWallet />}
                      />
                      <Route path="/import-wallet" element={<ImportAccount onNavigateBack={() => null} newWallet />} />
                      <Route path="/master-restore" element={<MasterRestore />} />
                      <Route
                        path="/connect"
                        element={
                          <ConnectRequest
                            request={connectRequest}
                            onDecision={() => clearRequest('connectRequest')}
                            whiteListedApps={whitelistedApps}
                            popupId={popupId}
                          />
                        }
                      />
                      <Route
                        path="/bsv-wallet"
                        element={
                          <Show
                            when={
                              !sendBsvRequest &&
                              !sendMNEERequest &&
                              !signMessageRequest &&
                              !permissionRequest &&
                              !transactionApprovalRequest
                            }
                            whenFalseContent={
                              <>
                                <Show when={!!sendBsvRequest}>
                                  <BsvSendRequest
                                    request={sendBsvRequest!}
                                    onResponse={() => clearRequest('sendBsvRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!sendMNEERequest}>
                                  <MNEESendRequest
                                    request={sendMNEERequest!}
                                    onResponse={() => clearRequest('sendMNEERequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!signMessageRequest}>
                                  <SignMessageRequest
                                    request={signMessageRequest!}
                                    onSignature={() => clearRequest('signMessageRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                {/* Permission request from WalletPermissionsManager */}
                                <Show when={!!permissionRequest}>
                                  <PermissionRequestPage
                                    request={permissionRequest!}
                                    onResponse={() => clearRequest('permissionRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                {/* Transaction approval request from YoursApi */}
                                <Show when={!!transactionApprovalRequest}>
                                  <TransactionApprovalRequest
                                    request={transactionApprovalRequest!}
                                    onResponse={() => clearRequest('transactionApprovalRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                              </>
                            }
                          >
                            <BsvWallet />
                          </Show>
                        }
                      />
                      <Route path="/ord-wallet" element={<OrdWallet />} />
                      <Route path="/tools" element={<AppsAndTools />} />
                      <Route path="/settings" element={<Settings />} />
                    </Routes>
                  </Router>
                </Show>
              </SnackbarProvider>
            </Container>
          </BottomMenuProvider>
        </SyncProvider>
      </BlockHeightProvider>
    </MainContainer>
  );
};
