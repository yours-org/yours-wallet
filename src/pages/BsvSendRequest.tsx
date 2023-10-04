import { useBottomMenu } from "../hooks/useBottomMenu";
import React, { useEffect, useState } from "react";
import { Button } from "../components/Button";
import {
  Text,
  HeaderText,
  ConfirmContent,
  FormContainer,
} from "../components/Reusable";
import { Show } from "../components/Show";
import { useSnackbar } from "../hooks/useSnackbar";
import { Web3SendBsvRequest, useBsv } from "../hooks/useBsv";
import { PageLoader } from "../components/PageLoader";
import { Input } from "../components/Input";
import { BSV_DECIMAL_CONVERSION } from "../utils/constants";
import { validate } from "bitcoin-address-validation";
import { truncate } from "../utils/format";
import { sleep } from "../utils/sleep";
import { useTheme } from "../hooks/useTheme";

export type BsvSendRequestProps = {
  web3Request: Web3SendBsvRequest;
  onResponse: () => void;
};

export const BsvSendRequest = (props: BsvSendRequestProps) => {
  const { web3Request, onResponse } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();

  const {
    bsvAddress,
    bsvBalance,
    isProcessing,
    setIsProcessing,
    sendBsv,
    getBsvBalance,
  } = useBsv();

  useEffect(() => {
    setSelected("bsv");
  }, [setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message && bsvAddress) {
      resetSendState();
      getBsvBalance(bsvAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message, getBsvBalance, bsvAddress]);

  const resetSendState = () => {
    setPasswordConfirm("");
    setSuccessTxId("");
    setIsProcessing(false);
  };

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    let validationFail = false;
    web3Request.forEach((request) => {
      if (!validate(request.address)) {
        validationFail = true;
      }
    });

    if (validationFail) {
      addSnackbar("Found an invalid receive address.", "error");
      setIsProcessing(false);
      return;
    }

    if (!web3Request[0].satAmount) {
      addSnackbar("No sats supplied", "info");
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm) {
      addSnackbar("You must enter a password!", "error");
      setIsProcessing(false);
      return;
    }

    const sendRes = await sendBsv(web3Request, passwordConfirm);
    if (!sendRes.txid || sendRes.error) {
      const message =
        sendRes.error === "invalid-password"
          ? "Invalid Password!"
          : sendRes.error === "insufficient-funds"
          ? "Insufficient Funds!"
          : "An unknown error has occurred! Try again.";

      addSnackbar(message, "error");
      return;
    }

    setSuccessTxId(sendRes.txid);
    addSnackbar("Transaction Successful!", "success");
    onResponse();
    await chrome.runtime.sendMessage({
      action: "sendBsvResult",
      txid: sendRes.txid,
    });
  };

  const web3Details = () => {
    return web3Request.map((r, i) => {
      return (
        <>
          <Text style={{ margin: "0.5rem" }} theme={theme}>{`${
            r.satAmount / BSV_DECIMAL_CONVERSION
          } => ${truncate(r.address, 5, 5)}`}</Text>
          <Show when={i === web3Request.length - 1}>
            <Text style={{ margin: "0.5rem" }} theme={theme}>{`Total: ${
              web3Request.reduce((a, item) => a + item.satAmount, 0) /
              BSV_DECIMAL_CONVERSION
            } BSV`}</Text>
          </Show>
        </>
      );
    });
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending BSV..." />
      </Show>

      <Show when={!isProcessing && !!web3Request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Text
            theme={theme}
            style={{ cursor: "pointer" }}
          >{`Available Balance: ${bsvBalance}`}</Text>
          <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
            {web3Details()}
            <Input
              theme={theme}
              placeholder="Enter Wallet Password"
              type="password"
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
            <Text theme={theme} style={{ margin: "3rem 0 1rem" }}>
              Double check details before sending.
            </Text>
            <Button
              theme={theme}
              type="primary"
              label={"Approve"}
              disabled={isProcessing}
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
