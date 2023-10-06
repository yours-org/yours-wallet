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
import { Web3SendBsvRequest } from "./hooks/useBsv";
import { Web3TransferOrdinalRequest } from "./hooks/useOrds";
import { OrdTransferRequest } from "./pages/requests/OrdTransferRequest";
import { BottomMenuContext } from "./contexts/BottomMenuContext";
import { ConnectRequest } from "./pages/requests/ConnectRequest";
import { SignMessageRequest } from "./pages/requests/SignMessageRequest";

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
  const { isLocked, setIsLocked } = useWalletLockState();
  const { theme } = useTheme();
  const menuContext = useContext(BottomMenuContext);
  const [popupId, setPopupId] = useState<number | undefined>(undefined);
  const [whitelistedDomains, setWhitelistedDomains] = useState<string[]>([]);
  const [messageToSign, setMessageToSign] = useState<string | undefined>(
    undefined
  );

  const [thirdPartyAppRequestData, setThirdPartyAppRequestData] = useState<
    ThirdPartyAppRequestData | undefined
  >(undefined);

  const [bsvSendRequest, setBsvSendRequest] = useState<
    Web3SendBsvRequest | undefined
  >(undefined);

  const [ordinalTransferRequest, setOrdinalTransferRequest] = useState<
    Web3TransferOrdinalRequest | undefined
  >(undefined);

  useActivityDetector(isLocked);

  const handleUnlock = async () => {
    setIsLocked(false);
  };

  useEffect(() => {
    storage.get(
      [
        "sendBsv",
        "transferOrdinal",
        "connectRequest",
        "popupWindowId",
        "whitelist",
        "signMessageRequest",
      ],
      (result) => {
        const {
          popupWindowId,
          connectRequest,
          whitelist,
          sendBsv,
          transferOrdinal,
          signMessageRequest,
        } = result;

        if (popupWindowId) setPopupId(popupWindowId);
        if (isLocked) return;

        if (connectRequest && !isLocked) {
          setThirdPartyAppRequestData(connectRequest);
        }

        if (whitelist) {
          setWhitelistedDomains(whitelist);
        }

        if (sendBsv) {
          setBsvSendRequest(sendBsv);
        }

        if (transferOrdinal) {
          setOrdinalTransferRequest(transferOrdinal);
          menuContext?.handleSelect("ords");
        }

        if (signMessageRequest) {
          setMessageToSign(signMessageRequest.message);
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
                    when={!bsvSendRequest && !messageToSign}
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
