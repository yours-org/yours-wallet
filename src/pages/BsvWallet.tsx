import styled from "styled-components";
import { ColorThemeProps } from "../theme";
import { useBottomMenu } from "../hooks/useBottomMenu";
import React, { useEffect, useState } from "react";
import bsvCoin from "../assets/bsv-coin.svg";
import { Button } from "../components/Button";
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
import switchAsset from "../assets/switch-asset.svg";
import { useSocialProfile } from "../hooks/useSocialProfile";

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

const ProfileImageContainer = styled.div`
  position: absolute;
  top: 10rem;
  right: 2.25rem;
`;

const ProfileImage = styled.img`
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 100%;
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

const InputAmountWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

type PageState = "main" | "receive" | "send";
type AmountType = "bsv" | "usd";

export type BsvWalletProps = {
  thirdPartyAppRequestData: ThirdPartyAppRequestData | undefined;
  messageToSign?: string;
  popupId?: number;
};

export const BsvWallet = (props: BsvWalletProps) => {
  const { thirdPartyAppRequestData, messageToSign, popupId } = props;
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [usdSendAmount, setUsdSendAmount] = useState<number | null>(null);
  const [receiveAddress, setReceiveAddress] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [amountType, setAmountType] = useState<AmountType>("bsv");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();
  const { ordPubKey } = useOrds();
  const { socialProfile } = useSocialProfile();

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

        // We don't want the window to stay open after a successful connection. The 1ms timeout is used because of some weirdness with how chrome.sendMessage() works
        setTimeout(() => {
          if (popupId) chrome.windows.remove(popupId);
        }, 10);
      }
    }
  }, [
    bsvPubKey,
    messageToSign,
    navigate,
    ordPubKey,
    popupId,
    thirdPartyAppRequestData,
  ]);

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
    setSatSendAmount(null);
    setUsdSendAmount(null);
    setAmountType("bsv");
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

  const toggleAmountType = () => {
    if (amountType === "bsv") {
      setAmountType("usd");
    } else {
      setAmountType("bsv");
    }
    setUsdSendAmount(null);
    setSatSendAmount(null);
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

    if (!satSendAmount && !usdSendAmount) {
      addSnackbar("You must enter an amount.", "info");
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm) {
      addSnackbar("You must enter a password!", "error");
      setIsProcessing(false);
      return;
    }

    let satAmount = satSendAmount ?? 0;
    if (amountType === "usd" && usdSendAmount) {
      satAmount = Math.ceil(
        (usdSendAmount / exchangeRate) * BSV_DECIMAL_CONVERSION
      );
    }

    const sendRes = await sendBsv(
      [{ address: receiveAddress, satAmount }],
      passwordConfirm
    );
    if (!sendRes.txid || sendRes.error) {
      const message =
        sendRes.error === "invalid-password"
          ? "Invalid Password!"
          : sendRes.error === "insufficient-funds"
          ? "Insufficient Funds!"
          : sendRes.error === "fee-to-high"
          ? "Miner fee to high!"
          : "An unknown error has occurred! Try again.";

      addSnackbar(message, "error");
      setPasswordConfirm("");
      return;
    }

    setSuccessTxId(sendRes.txid);
    addSnackbar("Transaction Successful!", "success");
  };

  const fillInputWithAllBsv = () => {
    setSatSendAmount(Math.round(bsvBalance * BSV_DECIMAL_CONVERSION));
  };

  useEffect(() => {
    const calcValue = () => {
      return amountType === "bsv"
        ? satSendAmount
          ? satSendAmount / BSV_DECIMAL_CONVERSION
          : undefined
        : amountType === "usd"
        ? usdSendAmount
          ? usdSendAmount
          : undefined
        : undefined;
    };

    calcValue();
  }, [satSendAmount, usdSendAmount, amountType]);

  const getLabel = () => {
    return amountType === "bsv" && satSendAmount
      ? `Send ${(satSendAmount / BSV_DECIMAL_CONVERSION).toFixed(8)}`
      : amountType === "usd" && usdSendAmount
      ? `Send ${formatUSD(usdSendAmount)}`
      : "Enter Send Details";
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
      <ProfileImageContainer>
        <ProfileImage src={socialProfile.avatar} />
      </ProfileImageContainer>
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
          <InputAmountWrapper>
            <Input
              theme={theme}
              placeholder={
                amountType === "bsv" ? "Enter BSV Amount" : "Enter USD Amount"
              }
              type="number"
              step="0.00000001"
              value={
                satSendAmount !== null && satSendAmount !== undefined
                  ? satSendAmount / BSV_DECIMAL_CONVERSION
                  : usdSendAmount !== null && usdSendAmount !== undefined
                  ? usdSendAmount
                  : ""
              }
              onChange={(e) => {
                const inputValue = e.target.value;

                // Check if the input is empty and if so, set the state to null
                if (inputValue === "") {
                  setSatSendAmount(null);
                  setUsdSendAmount(null);
                } else {
                  // Existing logic for setting state
                  if (amountType === "bsv") {
                    setSatSendAmount(
                      Math.round(Number(inputValue) * BSV_DECIMAL_CONVERSION)
                    );
                  } else {
                    setUsdSendAmount(Number(inputValue));
                  }
                }
              }}
            />
            <Icon
              src={switchAsset}
              size="1rem"
              style={{
                position: "absolute",
                right: "2.25rem",
                cursor: "pointer",
              }}
              onClick={toggleAmountType}
            />
          </InputAmountWrapper>
          <Input
            theme={theme}
            placeholder="Enter Wallet Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <Text theme={theme} style={{ margin: "3rem 0 1rem" }}>
            Double check details before sending.
          </Text>
          <Button
            theme={theme}
            type="primary"
            label={getLabel()}
            disabled={isProcessing || (!usdSendAmount && !satSendAmount)}
            isSubmit
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
