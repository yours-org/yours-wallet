import styled from "styled-components";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import {
  ButtonContainer,
  ConfirmContent,
  FormContainer,
  HeaderText,
  MainContent,
  ReceiveContent,
  Text,
} from "../components/Reusable";
import { useOrds } from "../hooks/useOrds";
import { GP_BASE_URL } from "../utils/constants";
import { Show } from "../components/Show";
import { colors } from "../colors";
import { BackButton } from "../components/BackButton";
import { QrCode } from "../components/QrCode";
import { useSnackbar } from "../hooks/useSnackbar";
import { PageLoader } from "../components/PageLoader";
import validate from "bitcoin-address-validation";
import { Input } from "../components/Input";

const OrdinalsList = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
`;
const Ordinal = styled.div<{ url: string; selected?: boolean }>`
  height: 9rem;
  width: 9rem;
  background-image: url(${(props) => props.url});
  background-size: cover;
  border-radius: 0.5rem;
  margin: 0.5rem;
  cursor: pointer;
  border: ${(props) =>
    props.selected ? `0.3rem solid ${colors.seaFoam}` : undefined};
`;

type PageState = "main" | "receive" | "transfer";

export const OrdWallet = () => {
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const {
    ordAddress,
    ordinals,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
  } = useOrds();
  const [selectedOrdinal, setSelectedOrdinal] = useState("");
  const [ordinalOutpoint, setOrdinalOutpoint] = useState("");
  const [receiveAddress, setReceiveAddress] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();

  useEffect(() => {
    setSelected("ords");
  }, [setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message && ordAddress) {
      setPageState("main");
      getOrdinals();
    }
  }, [successTxId, message, getOrdinals, ordAddress]);

  const resetSendState = () => {
    setReceiveAddress("");
    setPasswordConfirm("");
    setSuccessTxId("");
    setIsProcessing(false);
  };

  const handleTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await new Promise((resolve) => setTimeout(resolve, 25));
    if (!validate(receiveAddress)) {
      addSnackbar("You must enter a valid 1Sat Ordinal address.", "info");
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm) {
      addSnackbar("You must enter a password!", "error");
      setIsProcessing(false);
      return;
    }

    const transferRes = await transferOrdinal(
      receiveAddress,
      ordinalOutpoint,
      passwordConfirm
    );

    if (!transferRes.txid || transferRes.error) {
      const message =
        transferRes.error === "invalid-password"
          ? "Invalid Password!"
          : transferRes.error === "insufficient-funds"
          ? "Insufficient Funds!"
          : transferRes.error === "no-ord-utxo"
          ? "Could not locate the ordinal!"
          : "An unknown error has occurred! Try again.";

      addSnackbar(message, "error");
      return;
    }

    setSuccessTxId(transferRes.txid);
    addSnackbar(
      "Transfer Successful! It may continue to show in your wallet until the tx is confirmed.",
      "success"
    );
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(ordAddress).then(() => {
      addSnackbar("Copied!", "success");
    });
  };

  const main = (
    <MainContent>
      <Show
        when={ordinals.length > 0}
        whenFalseContent={
          <Text
            style={{
              marginTop: "11rem",
              color: colors.white,
              fontSize: "1rem",
            }}
          >
            You have no 1Sat Ordinals. NGMI 😬
          </Text>
        }
      >
        <OrdinalsList>
          {ordinals.map((ord) => {
            return (
              <Ordinal
                key={ord.origin}
                url={`${GP_BASE_URL}/files/inscriptions/${ord.origin}`}
                selected={selectedOrdinal === ord.origin}
                onClick={() => {
                  setSelectedOrdinal(ord.origin);
                  setOrdinalOutpoint(ord.outpoint);
                }}
              />
            );
          })}
        </OrdinalsList>
      </Show>
      <ButtonContainer>
        <Button
          type="primary"
          label="Receive"
          onClick={() => setPageState("receive")}
        />
        <Button
          type="primary"
          label="Transfer"
          onClick={async () => {
            if (!selectedOrdinal) {
              addSnackbar("You must select an ordinal to send!", "info");
              return;
            }
            setPageState("transfer");
          }}
        />
      </ButtonContainer>
    </MainContent>
  );

  const receive = (
    <ReceiveContent>
      <BackButton
        onClick={() => {
          setPageState("main");
          getOrdinals();
        }}
      />
      <HeaderText>Only Send 1Sat Ordinals</HeaderText>
      <Text style={{ marginBottom: "1rem" }}>
        Do not send BSV to this address!
      </Text>
      <QrCode address={ordAddress} onClick={handleCopyToClipboard} />
      <Text
        style={{ marginTop: "1.5rem", cursor: "pointer" }}
        onClick={handleCopyToClipboard}
      >
        {ordAddress}
      </Text>
    </ReceiveContent>
  );

  const transfer = (
    <>
      <BackButton
        onClick={() => {
          setPageState("main");
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText>Transfer Ordinal</HeaderText>
        <FormContainer noValidate onSubmit={(e) => handleTransferOrdinal(e)}>
          <Input
            placeholder="Receive Address"
            type="text"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Input
            placeholder="Password"
            type="password"
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <Text style={{ margin: "3rem 0 1rem" }}>
            Double check details before sending.
          </Text>
          <Button type="primary" label="Send BSV" disabled={isProcessing} />
        </FormContainer>
      </ConfirmContent>
    </>
  );

  return (
    <>
      <Show when={isProcessing && pageState === "main"}>
        <PageLoader message="Loading ordinals..." />
      </Show>
      <Show when={isProcessing && pageState === "transfer"}>
        <PageLoader message="Sending Ordinal..." />
      </Show>
      <Show when={!isProcessing && pageState === "main"}>{main}</Show>
      <Show when={!isProcessing && pageState === "receive"}>{receive}</Show>
      <Show when={!isProcessing && pageState === "transfer"}>{transfer}</Show>
    </>
  );
};
