import styled from "styled-components";
import { ColorThemeProps } from "../theme";
import { useBottomMenu } from "../hooks/useBottomMenu";
import React, { useEffect, useState } from "react";
import bsvCoin from "../assets/bsv-coin.svg";
import { Button } from "../components/Button";
import { PandaHead } from "../components/PandaHead";
import { BackButton } from "../components/BackButton";
import {
  Text,
  HeaderText,
  ButtonContainer,
  ReceiveContent,
  MainContent,
  ConfirmContent,
  FormContainer,
} from "../components/Reusable";
import { QrCode } from "../components/QrCode";
import { Show } from "../components/Show";
import { useSnackbar } from "../hooks/useSnackbar";
import { PageLoader } from "../components/PageLoader";
import { Input } from "../components/Input";
import { BSV_DECIMAL_CONVERSION } from "../utils/constants";
import { validate } from "bitcoin-address-validation";
import { formatUSD } from "../utils/format";
import { sleep } from "../utils/sleep";
import { useTheme } from "../hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { ThirdPartyAppRequestData } from "../App";
import { useBsv } from "../hooks/useBsv";
import { useOrds } from "../hooks/useOrds";

const MiddleContainer = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 80%;
  padding: 2.75rem 1rem;
  border-radius: 1rem;
  border: 0.25rem solid ${({ theme }) => theme.mainBackground + "70"};
  background-color: ${({ theme }) => theme.darkAccent};
`;

const PandaHeadContainer = styled.div`
  position: absolute;
  top: 10rem;
  right: 2.25rem;
  opacity: 0.5;
`;

const BalanceContainer = styled.div`
  display: flex;
  align-items: center;
`;

const NumberWrapper = styled.span<ColorThemeProps>`
  font-size: 2.5rem;
  color: ${({ theme }) => theme.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

const Major = styled.span`
  font-size: inherit;
`;

const Minor = styled.span<ColorThemeProps>`
  font-size: 1rem;
  color: ${({ theme }) => theme.white + "80"};
`;

const Icon = styled.img<{ size?: string }>`
  width: ${(props) => props.size ?? "1.5rem"};
  height: ${(props) => props.size ?? "1.5rem"};
  margin: 0 0.5rem 0 0;
`;

type PageState = "main" | "receive" | "send";

export type BsvWalletProps = {
  thirdPartyAppRequestData: ThirdPartyAppRequestData | undefined;
  messageToSign?: string;
};

export const BsvWallet = (props: BsvWalletProps) => {
  const { thirdPartyAppRequestData, messageToSign } = props;
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const [satSendAmount, setSatSendAmount] = useState(0);
  const [receiveAddress, setReceiveAddress] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();
  const { ordPubKey } = useOrds();

  const {
    bsvAddress,
    bsvBalance,
    isProcessing,
    setIsProcessing,
    sendBsv,
    getBsvBalance,
    exchangeRate,
    bsvPubKey,
  } = useBsv();

  useEffect(() => {
    if (!messageToSign) return;
  }, [messageToSign]);

  useEffect(() => {
    if (thirdPartyAppRequestData && !thirdPartyAppRequestData.isAuthorized) {
      navigate("/connect");
    } else {
      if (!bsvPubKey || !ordPubKey) return;
      if (!window.location.href.includes("localhost")) {
        chrome.runtime.sendMessage({
          action: "userConnectResponse",
          decision: "approved",
          pubKeys: { bsvPubKey, ordPubKey },
        });
      }
    }
  }, [bsvPubKey, messageToSign, navigate, ordPubKey, thirdPartyAppRequestData]);

  useEffect(() => {
    setSelected("bsv");
  }, [setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message && bsvAddress) {
      resetSendState();
      setPageState("main");
      getBsvBalance(bsvAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message, getBsvBalance, bsvAddress]);

  const resetSendState = () => {
    setSatSendAmount(0);
    setReceiveAddress("");
    setPasswordConfirm("");
    setSuccessTxId("");
    setIsProcessing(false);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(bsvAddress).then(() => {
      addSnackbar("Copied!", "success");
    });
  };

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    if (!validate(receiveAddress)) {
      addSnackbar(
        "You must enter a valid BSV address. Paymail not yet supported.",
        "info"
      );
      setIsProcessing(false);
      return;
    }

    if (!satSendAmount) {
      addSnackbar("You must enter an amount.", "info");
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm) {
      addSnackbar("You must enter a password!", "error");
      setIsProcessing(false);
      return;
    }

    const sendRes = await sendBsv(
      [{ address: receiveAddress, satAmount: satSendAmount }],
      passwordConfirm
    );
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
  };

  const fillInputWithAllBsv = () => {
    setSatSendAmount(Math.round(bsvBalance * BSV_DECIMAL_CONVERSION));
  };

  const formatBalance = (number: number) => {
    // Convert the number to string with fixed 8 decimal places
    const numStr = number.toFixed(8);

    const [whole, decimal] = numStr.split(".");

    const [firstChar, secondChar, ...rest] = decimal.split("");

    const firstTwoDecimal = `${firstChar}${secondChar}`;
    const nextThreeDecimal = rest.slice(0, 3).join("");
    const lastThreeDecimal = rest.slice(3, 6).join("");

    return (
      <NumberWrapper theme={theme}>
        <Major theme={theme}>{`${whole}.${firstTwoDecimal}`}</Major>
        <Minor
          theme={theme}
        >{` ${nextThreeDecimal} ${lastThreeDecimal}`}</Minor>
      </NumberWrapper>
    );
  };

  const receive = (
    <ReceiveContent>
      <BackButton
        onClick={() => {
          setPageState("main");
          getBsvBalance(bsvAddress);
        }}
      />
      <Icon size={"2.5rem"} src={bsvCoin} />
      <HeaderText style={{ marginTop: "1rem" }} theme={theme}>
        Only Send BSV
      </HeaderText>
      <Text theme={theme} style={{ marginBottom: "1rem" }}>
        Do not send ordinals to this address!
      </Text>
      <QrCode address={bsvAddress} onClick={handleCopyToClipboard} />
      <Text
        theme={theme}
        style={{ marginTop: "1.5rem", cursor: "pointer" }}
        onClick={handleCopyToClipboard}
      >
        {bsvAddress}
      </Text>
    </ReceiveContent>
  );

  const main = (
    <MainContent>
      <PandaHeadContainer>
        <PandaHead width="1.75rem" />
      </PandaHeadContainer>
      <MiddleContainer theme={theme}>
        <BalanceContainer>
          <Icon src={bsvCoin} />
          {formatBalance(bsvBalance)}
        </BalanceContainer>
        <Text theme={theme} style={{ margin: "0.5rem 0 0 0" }}>
          {formatUSD(bsvBalance * exchangeRate)}
        </Text>
      </MiddleContainer>
      <ButtonContainer>
        <Button
          theme={theme}
          type="primary"
          label="Receive"
          onClick={() => setPageState("receive")}
        />
        <Button
          theme={theme}
          type="primary"
          label="Send"
          onClick={() => setPageState("send")}
        />
      </ButtonContainer>
    </MainContent>
  );

  const send = (
    <>
      <BackButton
        onClick={() => {
          setPageState("main");
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText theme={theme}>Send BSV</HeaderText>
        <Text
          theme={theme}
          style={{ cursor: "pointer" }}
          onClick={fillInputWithAllBsv}
        >{`Available Balance: ${bsvBalance}`}</Text>
        <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
          <Input
            theme={theme}
            placeholder="Enter Address"
            type="text"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Input
            theme={theme}
            placeholder="Enter BSV Amount"
            type="number"
            step="0.00000001"
            value={
              satSendAmount ? satSendAmount / BSV_DECIMAL_CONVERSION : undefined
            }
            onChange={(e) =>
              setSatSendAmount(
                Math.round(Number(e.target.value) * BSV_DECIMAL_CONVERSION)
              )
            }
          />
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
            label="Send BSV"
            disabled={isProcessing}
          />
        </FormContainer>
      </ConfirmContent>
    </>
  );

  return (
    <>
      <Show when={isProcessing && pageState === "main"}>
        <PageLoader theme={theme} message="Loading wallet..." />
      </Show>
      <Show when={isProcessing && pageState === "send"}>
        <PageLoader theme={theme} message="Sending BSV..." />
      </Show>
      <Show when={!isProcessing && pageState === "main"}>{main}</Show>
      <Show when={!isProcessing && pageState === "receive"}>{receive}</Show>
      <Show when={!isProcessing && pageState === "send"}>{send}</Show>
    </>
  );
};
