import styled from "styled-components";
import { colors } from "../colors";
import { BottomMenu } from "../components/BottomMenu";
import { useBottomMenu } from "../hooks/useBottomMenu";
import React, { useEffect, useState } from "react";
import bsvCoin from "../assets/bsv-coin.svg";
import { Button } from "../components/Button";
import { PandaHead } from "../components/PandaHead";
import { BackButton } from "../components/BackButton";
import { DescText, HeaderText } from "../components/Reusable";
import { QrCode } from "../components/QrCode";
import { Show } from "../components/Show";
import { useSnackbar } from "../hooks/useSnackbar";
import { useBsv } from "../hooks/useBsv";
import { PageLoader } from "../components/PageLoader";
import { Input } from "../components/Input";
import { BSV_DECIMAL_CONVERSION } from "../utils/constants";
import { validate } from "bitcoin-address-validation";

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: calc(100% - 3.75rem);
`;

const ConfirmContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
`;

const ReceiveContent = styled(MainContent)`
  justify-content: center;
  width: 100%;
  height: calc(100% - 3.75rem);
`;

const MiddleContainer = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  width: 100%;
`;

const ButtonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  margin-bottom: 3rem;
`;

const BalanceContainer = styled.div`
  display: flex;
  align-items: center;
`;

const NumberWrapper = styled.span`
  font-size: 2.5rem;
  color: ${colors.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

const Major = styled.span`
  font-size: inherit;
`;

const Minor = styled.span`
  font-size: 1rem;
  color: ${colors.white + "80"};
`;

const Icon = styled.img`
  width: 1.5rem;
  height: 1.5rem;
  margin: 0 0.5rem 0 0;
`;

type PageState = "main" | "receive" | "send";

export const Bsv = () => {
  const { handleSelect, selected, setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const [satSendAmount, setSatSendAmount] = useState(0);
  const [receiveAddress, setReceiveAddress] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();
  const { bsvAddress, bsvBalance, isProcessing, setIsProcessing, sendBsv } =
    useBsv();

  useEffect(() => {
    setSelected("bsv");
  }, [setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message) {
      setPageState("main");
      setTimeout(() => window.location.reload(), 1000);
    }
  }, [successTxId, message]);

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
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (!validate(receiveAddress)) {
      addSnackbar(
        "You must enter a valid BSV address. Paymail not yet supported",
        "info"
      );
      return;
    }

    if (!satSendAmount) {
      addSnackbar("You must enter an amount.", "info");
      return;
    }

    if (!passwordConfirm) {
      addSnackbar("Invalid password!", "error");
      return;
    }

    const sendRes = await sendBsv(
      receiveAddress,
      satSendAmount,
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
      <NumberWrapper>
        <Major>{`${whole}.${firstTwoDecimal}`}</Major>
        <Minor>{` ${nextThreeDecimal} ${lastThreeDecimal}`}</Minor>
      </NumberWrapper>
    );
  };

  const receive = (
    <ReceiveContent>
      <BackButton
        onClick={() => {
          setPageState("main");
          setTimeout(() => window.location.reload(), 1000);
        }}
      />
      <HeaderText>Only send BSV</HeaderText>
      <DescText style={{ marginBottom: "1rem" }}>
        Do not send ordinals to this address!
      </DescText>
      <QrCode address={bsvAddress} onClick={handleCopyToClipboard} />
      <DescText
        style={{ marginTop: "1.5rem", cursor: "pointer" }}
        onClick={handleCopyToClipboard}
      >
        {bsvAddress}
      </DescText>
    </ReceiveContent>
  );

  const main = (
    <MainContent>
      <PandaHead width="2.5rem" />
      <MiddleContainer>
        <BalanceContainer>
          <Icon src={bsvCoin} />
          {formatBalance(bsvBalance)}
        </BalanceContainer>
      </MiddleContainer>
      <ButtonContainer>
        <Button
          type="primary"
          label="Receive"
          onClick={() => setPageState("receive")}
        />
        <Button
          type="primary"
          label="Send"
          onClick={() => setPageState("send")}
        />
      </ButtonContainer>
      <BottomMenu handleSelect={handleSelect} selected={selected} />
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
        <HeaderText>Send BSV</HeaderText>
        <DescText
          style={{ cursor: "pointer" }}
          onClick={fillInputWithAllBsv}
        >{`Available Balance: ${bsvBalance}`}</DescText>
        <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
          <Input
            placeholder="Enter Address"
            type="text"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Input
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
            placeholder="Enter Wallet Password"
            type="password"
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <DescText style={{ margin: "3rem 0 1rem" }}>
            Double check details before sending.
          </DescText>
          <Button type="primary" label="Send BSV" disabled={isProcessing} />
        </FormContainer>
      </ConfirmContent>
    </>
  );

  return (
    <>
      <Show when={isProcessing && pageState === "main"}>
        <PageLoader message="Loading wallet..." />
      </Show>
      <Show when={isProcessing && pageState === "send"}>
        <PageLoader message="Sending BSV..." />
      </Show>
      <Show when={!isProcessing && pageState === "main"}>{main}</Show>
      <Show when={!isProcessing && pageState === "receive"}>{receive}</Show>
      <Show when={!isProcessing && pageState === "send"}>{send}</Show>
    </>
  );
};
