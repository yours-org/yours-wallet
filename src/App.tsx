import styled from "styled-components";
import { Start } from "./pages/onboarding/Start";
import { MemoryRouter as Router, Routes, Route } from "react-router-dom";
import { ColorThemeProps } from "./theme";
import { CreateWallet } from "./pages/onboarding/CreateWallet";
import { Settings } from "./pages/Settings";
import { BsvWallet } from "./pages/BsvWallet";
import { OrdWallet } from "./pages/OrdWallet";
import { RestoreWallet } from "./pages/onboarding/RestoreWallet";
import { useActivityDetector } from "./hooks/useActivityDetector";
import { Show } from "./components/Show";
import { UnlockWallet } from "./components/UnlockWallet";
import { useWalletLockState } from "./hooks/useWalletLockState";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { useTheme } from "./hooks/useTheme";
import { BsvSendRequest } from "./pages/requests/BsvSendRequest";
import { storage } from "./utils/storage";
import { useContext, useEffect, useState } from "react";
import {
  Web3BroadcastRequest,
  Web3SendBsvRequest,
  Web3SignTransactionRequest,
} from "./hooks/useBsv";
import { Web3TransferOrdinalRequest } from "./hooks/useOrds";
import { Web3GetSignaturesRequest } from "./hooks/useContracts";
import { OrdTransferRequest } from "./pages/requests/OrdTransferRequest";
import { BottomMenuContext } from "./contexts/BottomMenuContext";
import { ConnectRequest } from "./pages/requests/ConnectRequest";
import { SignMessageRequest } from "./pages/requests/SignMessageRequest";
import { BroadcastRequest } from "./pages/requests/BroadcastRequest";
import { SignTransactionRequest } from "./pages/requests/SignTransactionRequest";
import { GetSignaturesRequest } from "./pages/requests/GetSignaturesRequest";

export type ThirdPartyAppRequestData = {
  appName: string;
  appIcon: string;
  domain: string;
  isAuthorized: boolean;
};

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
  const { theme } = useTheme();
  const menuContext = useContext(BottomMenuContext);
  const [popupId, setPopupId] = useState<number | undefined>(undefined);
  const [whitelistedDomains, setWhitelistedDomains] = useState<string[]>([]);
  const [messageToSign, setMessageToSign] = useState<string | undefined>(
    undefined
  );

  const [broadcastRequest, setBroadcastRequest] = useState<
    Web3BroadcastRequest | undefined
  >(undefined);

  const [thirdPartyAppRequestData, setThirdPartyAppRequestData] = useState<
    ThirdPartyAppRequestData | undefined
  >(undefined);

  const [bsvSendRequest, setBsvSendRequest] = useState<
    Web3SendBsvRequest | undefined
  >(undefined);

  const [ordinalTransferRequest, setOrdinalTransferRequest] = useState<
    Web3TransferOrdinalRequest | undefined
  >(undefined);

  const [signTransactionRequest, setSignTransactionRequest] = useState<
    Web3SignTransactionRequest | undefined
  >(undefined);

  const [getSignaturesRequest, setGetSignaturesRequest] = useState<
    Web3GetSignaturesRequest | undefined
  >(undefined);

  useActivityDetector(isLocked);

  const handleUnlock = async () => {
    window.location.reload();
  };

  useEffect(() => {
    storage.get(
      [
        "sendBsvRequest",
        "transferOrdinalRequest",
        "connectRequest",
        "popupWindowId",
        "whitelist",
        "signMessageRequest",
        "signTransactionRequest",
        "broadcastRequest",
        "getSignaturesRequest",
      ],
      (result) => {
        const {
          popupWindowId,
          connectRequest,
          whitelist,
          sendBsvRequest,
          transferOrdinalRequest,
          signMessageRequest,
          signTransactionRequest,
          broadcastRequest,
          getSignaturesRequest,
        } = result;

        if (popupWindowId) setPopupId(popupWindowId);
        if (isLocked) return;

        if (connectRequest && !isLocked) {
          setThirdPartyAppRequestData(connectRequest);
        }

        if (whitelist) {
          setWhitelistedDomains(whitelist);
        }

        if (sendBsvRequest) {
          setBsvSendRequest(sendBsvRequest);
        }

        if (transferOrdinalRequest) {
          setOrdinalTransferRequest(transferOrdinalRequest);
          menuContext?.handleSelect("ords");
        }

        if (signMessageRequest) {
          setMessageToSign(signMessageRequest.message);
        }

        if (signTransactionRequest) {
          setSignTransactionRequest(signTransactionRequest);
        }

        if (broadcastRequest) {
          setBroadcastRequest(broadcastRequest);
        }

        if (getSignaturesRequest) {
          setGetSignaturesRequest(getSignaturesRequest);
        }
      }
    );
  }, [isLocked, menuContext]);

  return (
    <Container theme={theme}>
      <SnackbarProvider>
        <Show
          when={!isLocked}
          whenFalseContent={<UnlockWallet onUnlock={handleUnlock} />}
        >
          <Router>
            <Routes>
              <Route path="/" element={<Start />} />
              <Route path="/create-wallet" element={<CreateWallet />} />
              <Route path="/restore-wallet" element={<RestoreWallet />} />
              <Route
                path="/connect"
                element={
                  <ConnectRequest
                    thirdPartyAppRequestData={thirdPartyAppRequestData}
                    popupId={popupId}
                    whitelistedDomains={whitelistedDomains}
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
                      !signTransactionRequest &&
                      !getSignaturesRequest
                    }
                    whenFalseContent={
                      <>
                        <Show when={!!bsvSendRequest}>
                          <BsvSendRequest
                            web3Request={bsvSendRequest as Web3SendBsvRequest}
                            onResponse={() => setBsvSendRequest(undefined)}
                          />
                        </Show>
                        <Show when={!!messageToSign}>
                          <SignMessageRequest
                            messageToSign={messageToSign ?? ""}
                            popupId={popupId}
                            onSignature={() => setMessageToSign(undefined)}
                          />
                        </Show>
                        <Show when={!!signTransactionRequest}>
                          <SignTransactionRequest
                            request={
                              signTransactionRequest as Web3SignTransactionRequest
                            }
                            popupId={popupId}
                            onSignature={() =>
                              setSignTransactionRequest(undefined)
                            }
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
                      </>
                    }
                  >
                    <BsvWallet
                      thirdPartyAppRequestData={thirdPartyAppRequestData}
                      messageToSign={messageToSign}
                    />
                  </Show>
                }
              />
              <Route
                path="/ord-wallet"
                element={
                  <Show
                    when={!!ordinalTransferRequest}
                    whenFalseContent={<OrdWallet />}
                  >
                    <OrdTransferRequest
                      web3Request={
                        ordinalTransferRequest as Web3TransferOrdinalRequest
                      }
                      onResponse={() => setOrdinalTransferRequest(undefined)}
                    />
                  </Show>
                }
              />
              <Route path="/ord-wallet" element={<OrdWallet />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Router>
        </Show>
      </SnackbarProvider>
    </Container>
  );
};
