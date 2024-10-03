/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useContext, useEffect, useState } from 'react';
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';
import { Show } from './components/Show';
import { UnlockWallet } from './components/UnlockWallet';
import { BottomMenuContext, BottomMenuProvider } from './contexts/BottomMenuContext';
import { SnackbarProvider } from './contexts/SnackbarContext';
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
import { BroadcastRequest } from './pages/requests/BroadcastRequest';
import { BsvSendRequest } from './pages/requests/BsvSendRequest';
import { ConnectRequest } from './pages/requests/ConnectRequest';
import { DecryptRequest } from './pages/requests/DecryptRequest';
import { EncryptRequest } from './pages/requests/EncryptRequest';
import { GenerateTaggedKeysRequest } from './pages/requests/GenerateTaggedKeysRequest';
import { GetSignaturesRequest } from './pages/requests/GetSignaturesRequest';
import { OrdPurchaseRequest } from './pages/requests/OrdPurchaseRequest';
import { OrdTransferRequest } from './pages/requests/OrdTransferRequest';
import { SignMessageRequest } from './pages/requests/SignMessageRequest';
import { Settings } from './pages/Settings';
import { WhiteLabelTheme } from './theme.types';
import { WhitelistedApp } from './inject';
import { PageLoader } from './components/PageLoader';
import { useServiceContext } from './hooks/useServiceContext';
import { useWeb3RequestContext } from './hooks/useWeb3RequestContext';
import { QueueProvider } from './contexts/QueueContext';
import { QueueBanner } from './components/QueueBanner';
import { BlockHeightProvider } from './contexts/BlockHeightContext';
import { SyncingBlocks } from './components/SyncingBlocks';
import { MasterRestore } from './pages/onboarding/MasterRestore';
import { Bsv20SendRequest } from './pages/requests/Bsv20SendRequest';

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
    sendBsv20Request,
    transferOrdinalRequest,
    purchaseOrdinalRequest,
    signMessageRequest,
    broadcastRequest,
    getSignaturesRequest,
    generateTaggedKeysRequest,
    encryptRequest,
    decryptRequest,
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

  useEffect(() => {
    if (transferOrdinalRequest || purchaseOrdinalRequest) {
      menuContext?.handleSelect('ords');
    }
  }, [transferOrdinalRequest, purchaseOrdinalRequest, menuContext]);

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
        <QueueProvider>
          <BottomMenuProvider network={chromeStorageService.getNetwork()}>
            <Container theme={theme}>
              <SnackbarProvider>
                <QueueBanner />
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
                              !sendBsv20Request &&
                              !signMessageRequest &&
                              !broadcastRequest &&
                              !getSignaturesRequest &&
                              !generateTaggedKeysRequest &&
                              !encryptRequest &&
                              !decryptRequest
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
                                <Show when={!!sendBsv20Request}>
                                  <Bsv20SendRequest
                                    request={sendBsv20Request!}
                                    onResponse={() => clearRequest('sendBsv20Request')}
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
                                <Show when={!!broadcastRequest}>
                                  <BroadcastRequest
                                    request={broadcastRequest!}
                                    onBroadcast={() => clearRequest('broadcastRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!getSignaturesRequest}>
                                  <GetSignaturesRequest
                                    request={getSignaturesRequest!}
                                    onSignature={() => clearRequest('getSignaturesRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!generateTaggedKeysRequest}>
                                  <GenerateTaggedKeysRequest
                                    request={generateTaggedKeysRequest!}
                                    onResponse={() => clearRequest('generateTaggedKeysRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!encryptRequest}>
                                  <EncryptRequest
                                    request={encryptRequest!}
                                    onEncrypt={() => clearRequest('encryptRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!decryptRequest}>
                                  <DecryptRequest
                                    request={decryptRequest!}
                                    onDecrypt={() => clearRequest('decryptRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                              </>
                            }
                          >
                            <BsvWallet isOrdRequest={!!transferOrdinalRequest || !!purchaseOrdinalRequest} />
                          </Show>
                        }
                      />
                      <Route
                        path="/ord-wallet"
                        element={
                          <Show
                            when={!transferOrdinalRequest && !purchaseOrdinalRequest}
                            whenFalseContent={
                              <>
                                <Show when={!!purchaseOrdinalRequest}>
                                  <OrdPurchaseRequest
                                    request={purchaseOrdinalRequest!}
                                    onResponse={() => clearRequest('purchaseOrdinalRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                                <Show when={!!transferOrdinalRequest}>
                                  <OrdTransferRequest
                                    request={transferOrdinalRequest!}
                                    onResponse={() => clearRequest('transferOrdinalRequest')}
                                    popupId={popupId}
                                  />
                                </Show>
                              </>
                            }
                          >
                            <OrdWallet />
                          </Show>
                        }
                      />
                      <Route path="/tools" element={<AppsAndTools />} />
                      <Route path="/settings" element={<Settings />} />
                    </Routes>
                  </Router>
                </Show>
              </SnackbarProvider>
            </Container>
          </BottomMenuProvider>
        </QueueProvider>
      </BlockHeightProvider>
    </MainContainer>
  );
};
