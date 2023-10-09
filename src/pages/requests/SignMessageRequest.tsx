import { useBottomMenu } from "../../hooks/useBottomMenu";
import React, { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import {
  Text,
  HeaderText,
  ConfirmContent,
  FormContainer,
} from "../../components/Reusable";
import { Show } from "../../components/Show";
import { useSnackbar } from "../../hooks/useSnackbar";
import { PageLoader } from "../../components/PageLoader";
import { Input } from "../../components/Input";
import { sleep } from "../../utils/sleep";
import { useTheme } from "../../hooks/useTheme";
import { styled } from "styled-components";
import { ColorThemeProps } from "../../theme";
import { useBsv } from "../../hooks/useBsv";
import { storage } from "../../utils/storage";
import { useNavigate } from "react-router-dom";

const RequestDetailsContainer = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-height: 10rem;
  overflow-y: scroll;
  background: ${({ theme }) => theme.darkAccent + "80"};
  margin: 0.5rem;
`;

export type SignMessageResponse = {
  address?: string;
  pubKeyHex?: string;
  signedMessage?: string;
  signatureHex?: string;
  error?: string;
};

export type SignMessageRequestProps = {
  messageToSign: string;
  popupId: number | undefined;
  onSignature: () => void;
};

export const SignMessageRequest = (props: SignMessageRequestProps) => {
  const { messageToSign, onSignature, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const navigate = useNavigate();

  const { isProcessing, setIsProcessing, signMessage } = useBsv();

  useEffect(() => {
    setSelected("bsv");
  }, [setSelected]);

  useEffect(() => {
    if (!signature) return;
    if (!message && signature) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, signature]);

  const resetSendState = () => {
    setPasswordConfirm("");
    setIsProcessing(false);
  };

  const handleSigning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm) {
      addSnackbar("You must enter a password!", "error");
      setIsProcessing(false);
      return;
    }

    const signRes = await signMessage(messageToSign, passwordConfirm);
    if (!signRes?.signatureHex) {
      const message =
        signRes?.error === "invalid-password"
          ? "Invalid Password!"
          : "An unknown error has occurred! Try again.";

      addSnackbar(message, "error");
      setIsProcessing(false);
      return;
    }

    addSnackbar("Successfully Signed!", "success");
    setSignature(signRes.signatureHex);
    onSignature();

    chrome.runtime.sendMessage({
      action: "signMessageResult",
      ...signRes,
    });

    if (!signRes.signatureHex && popupId) chrome.windows.remove(popupId);
    storage.remove("signMessageRequest");
    navigate("/bsv-wallet");
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Signing Transaction..." />
      </Show>
      <Show when={!isProcessing && !!messageToSign}>
        <ConfirmContent>
          <HeaderText theme={theme}>Sign Message</HeaderText>
          <Text theme={theme} style={{ margin: "0.75rem 0" }}>
            The app is requesting a signature.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            <RequestDetailsContainer>
              {<Text style={{ color: theme.white }}>{messageToSign}</Text>}
            </RequestDetailsContainer>
            <Input
              theme={theme}
              placeholder="Enter Wallet Password"
              type="password"
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
            <Button
              theme={theme}
              type="primary"
              label="Sign Message"
              disabled={isProcessing}
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
