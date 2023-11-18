import { useContext, useEffect, useState } from 'react';
import { Route, MemoryRouter as Router, Routes } from 'react-router-dom';
import styled from 'styled-components';
import { Show } from './components/Show';
import { UnlockWallet } from './components/UnlockWallet';
import { BottomMenuContext, BottomMenuProvider } from './contexts/BottomMenuContext';
import { SnackbarProvider } from './contexts/SnackbarContext';
import { useActivityDetector } from './hooks/useActivityDetector';
import { Web3BroadcastRequest, Web3SendBsvRequest, Web3SignMessageRequest } from './hooks/useBsv';
import { Web3GetSignaturesRequest } from './hooks/useContracts';
import { Web3TransferOrdinalRequest } from './hooks/useOrds';
import { useTheme } from './hooks/useTheme';
import { useViewport } from './hooks/useViewport';
import { useWalletLockState } from './hooks/useWalletLockState';
import { AppsAndTools } from './pages/AppsAndTools';
import { BsvWallet } from './pages/BsvWallet';
import { OrdWallet } from './pages/OrdWallet';
import { Settings } from './pages/Settings';
import { CreateWallet } from './pages/onboarding/CreateWallet';
import { ImportWallet } from './pages/onboarding/ImportWallet';
import { RestoreWallet } from './pages/onboarding/RestoreWallet';
import { Start } from './pages/onboarding/Start';
import { BroadcastRequest } from './pages/requests/BroadcastRequest';
import { BsvSendRequest } from './pages/requests/BsvSendRequest';
import { ConnectRequest } from './pages/requests/ConnectRequest';
import { GenerateTaggedKeysRequest } from './pages/requests/GenerateTaggedKeysRequest';
import { GetSignaturesRequest } from './pages/requests/GetSignaturesRequest';
import { OrdPurchaseRequest, Web3PurchaseOrdinalRequest } from './pages/requests/OrdPurchaseRequest';
import { OrdTransferRequest } from './pages/requests/OrdTransferRequest';
import { SignMessageRequest } from './pages/requests/SignMessageRequest';
import { ColorThemeProps } from './theme';
import { DerivationTag } from './utils/keys';
import { storage } from './utils/storage';

export type ThirdPartyAppRequestData = {
  appName: string;
  appIcon: string;
  domain: string;
  isAuthorized: boolean;
};

export type WhitelistedApp = {
  domain: string;
  icon: string;
};

const MainContainer = styled.div<{ $isMobile?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${(props) => (props.$isMobile ? '100vw' : '22.5rem')};
  height: ${(props) => (props.$isMobile ? '100vh' : '33.75rem')};
  position: relative;
  padding: 0;
  margin: auto;
`;

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.mainBackground};
  position: relative;
`;
export const App = () => {
  const { isLocked } = useWalletLockState();
  const { isMobile } = useViewport();
  const { theme } = useTheme();
  const menuContext = useContext(BottomMenuContext);
  const [popupId, setPopupId] = useState<number | undefined>();
  const [whitelistedApps, setWhitelistedApps] = useState<WhitelistedApp[]>([]);

  const [messageToSign, setMessageToSign] = useState<Web3SignMessageRequest | undefined>();
  const [broadcastRequest, setBroadcastRequest] = useState<Web3BroadcastRequest | undefined>();
  const [thirdPartyAppRequestData, setThirdPartyAppRequestData] = useState<ThirdPartyAppRequestData | undefined>();
  const [bsvSendRequest, setBsvSendRequest] = useState<Web3SendBsvRequest | undefined>();
  const [ordinalTransferRequest, setOrdinalTransferRequest] = useState<Web3TransferOrdinalRequest | undefined>();
  const [ordinalPurchaseRequest, setOrdinalPurchaseRequest] = useState<Web3PurchaseOrdinalRequest | undefined>();
  const [getSignaturesRequest, setGetSignaturesRequest] = useState<Web3GetSignaturesRequest | undefined>();
  const [pubKeyFromTagRequest, setPubKeyFromTagRequest] = useState<DerivationTag | undefined>();

  useActivityDetector(isLocked);

  const handleUnlock = async () => {
    window.location.reload();
  };

  useEffect(() => {
    storage.get(
      [
        'sendBsvRequest',
        'transferOrdinalRequest',
        'purchaseOrdinalRequest',
        'connectRequest',
        'popupWindowId',
        'whitelist',
        'signMessageRequest',
        'signTransactionRequest',
        'broadcastRequest',
        'getSignaturesRequest',
        'generateTaggedKeysRequest',
      ],
      (result) => {
        const {
          popupWindowId,
          connectRequest,
          whitelist,
          sendBsvRequest,
          transferOrdinalRequest,
          purchaseOrdinalRequest,
          signMessageRequest,
          broadcastRequest,
          getSignaturesRequest,
          generateTaggedKeysRequest,
        } = result;

        if (popupWindowId) setPopupId(popupWindowId);
        if (isLocked) return;

        if (connectRequest && !isLocked) {
          setThirdPartyAppRequestData(connectRequest);
        }

        if (whitelist) {
          setWhitelistedApps(whitelist);
        }

        if (sendBsvRequest) {
          setBsvSendRequest(sendBsvRequest);
        }

        if (transferOrdinalRequest) {
          setOrdinalTransferRequest(transferOrdinalRequest);
          menuContext?.handleSelect('ords');
        }

        if (purchaseOrdinalRequest) {
          setOrdinalPurchaseRequest(purchaseOrdinalRequest);
          menuContext?.handleSelect('ords');
        }

        if (signMessageRequest) {
          setMessageToSign(signMessageRequest);
        }

        if (broadcastRequest) {
          setBroadcastRequest(broadcastRequest);
        }

        if (getSignaturesRequest) {
          setGetSignaturesRequest(getSignaturesRequest);
        }

        if (generateTaggedKeysRequest) {
          setPubKeyFromTagRequest(generateTaggedKeysRequest);
        }
      },
    );
  }, [isLocked, menuContext]);

  return (
    <MainContainer $isMobile={isMobile}>
      <BottomMenuProvider>
        <Container theme={theme}>
          <SnackbarProvider>
            <Show when={!isLocked} whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}>
              <Router>
                <Routes>
                  <Route path="/" element={<Start />} />
                  <Route path="/create-wallet" element={<CreateWallet />} />
                  <Route path="/restore-wallet" element={<RestoreWallet />} />
                  <Route path="/import-wallet" element={<ImportWallet />} />
                  <Route
                    path="/connect"
                    element={
                      <ConnectRequest
                        thirdPartyAppRequestData={thirdPartyAppRequestData}
                        popupId={popupId}
                        whiteListedApps={whitelistedApps}
                        onDecision={() => setThirdPartyAppRequestData(undefined)}
                      />
                    }
                  />
                  <Route
                    path="/bsv-wallet"
                    element={
                      <Show
                        when={
                          !bsvSendRequest &&
                          !messageToSign &&
                          !broadcastRequest &&
                          !getSignaturesRequest &&
                          !pubKeyFromTagRequest
                        }
                        whenFalseContent={
                          <>
                            <Show when={!!bsvSendRequest}>
                              <BsvSendRequest
                                popupId={popupId}
                                web3Request={bsvSendRequest as Web3SendBsvRequest}
                                onResponse={() => setBsvSendRequest(undefined)}
                              />
                            </Show>
                            <Show when={!!messageToSign}>
                              <SignMessageRequest
                                messageToSign={messageToSign as Web3SignMessageRequest}
                                popupId={popupId}
                                onSignature={() => setMessageToSign(undefined)}
                              />
                            </Show>
                            <Show when={!!broadcastRequest}>
                              <BroadcastRequest
                                request={broadcastRequest as Web3BroadcastRequest}
                                popupId={popupId}
                                onBroadcast={() => setBroadcastRequest(undefined)}
                              />
                            </Show>
                            <Show when={!!getSignaturesRequest}>
                              <GetSignaturesRequest
                                getSigsRequest={getSignaturesRequest as Web3GetSignaturesRequest}
                                popupId={popupId}
                                onSignature={() => setGetSignaturesRequest(undefined)}
                              />
                            </Show>
                            <Show when={!!pubKeyFromTagRequest}>
                              <GenerateTaggedKeysRequest
                                web3Request={pubKeyFromTagRequest as DerivationTag}
                                popupId={popupId}
                                onResponse={() => setPubKeyFromTagRequest(undefined)}
                              />
                            </Show>
                          </>
                        }
                      >
                        <BsvWallet />
                      </Show>
                    }
                  />
                  <Route
                    path="/ord-wallet"
                    element={
                      <Show
                        when={!ordinalTransferRequest && !ordinalPurchaseRequest}
                        whenFalseContent={
                          <>
                            <Show when={!!ordinalPurchaseRequest}>
                              <OrdPurchaseRequest
                                popupId={popupId}
                                web3Request={ordinalPurchaseRequest as Web3PurchaseOrdinalRequest}
                                onResponse={() => setOrdinalPurchaseRequest(undefined)}
                              />
                            </Show>
                            <Show when={!!ordinalTransferRequest}>
                              <OrdTransferRequest
                                popupId={popupId}
                                web3Request={ordinalTransferRequest as Web3TransferOrdinalRequest}
                                onResponse={() => setOrdinalTransferRequest(undefined)}
                              />
                            </Show>
                          </>
                        }
                      >
                        <OrdWallet />
                      </Show>
                    }
                  />
                  <Route path="/ord-wallet" element={<OrdWallet />} />
                  <Route path="/apps" element={<AppsAndTools />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Router>
            </Show>
          </SnackbarProvider>
        </Container>
      </BottomMenuProvider>
    </MainContainer>
  );
};
