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
import { Web3SignTransactionRequest, useBsv } from "../../hooks/useBsv";
import { storage } from "../../utils/storage";
import { useNavigate } from "react-router-dom";

export type SignTransactionRequestProps = {
  request: Web3SignTransactionRequest;
  popupId: number | undefined;
  onSignature: () => void;
};

export const SignTransactionRequest = (props: SignTransactionRequestProps) => {
  const { request, onSignature, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const navigate = useNavigate();

  const { isProcessing, setIsProcessing, signTransaction } = useBsv();

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

    const signRes = await signTransaction(passwordConfirm, request);

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
      action: "signTransactionResponse",
      ...signRes,
    });

    if (!signRes.signatureHex && popupId) chrome.windows.remove(popupId);
    storage.remove("signTransactionRequest");
    navigate("/bsv-wallet");
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Signing Transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Sign Transaction</HeaderText>
          <Text theme={theme} style={{ margin: "0.75rem 0" }}>
            The app is requesting to sign a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
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
