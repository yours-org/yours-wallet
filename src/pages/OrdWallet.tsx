import styled from "styled-components";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import oneSatLogo from "../assets/1sat-logo.svg";
import {
  ButtonContainer,
  ConfirmContent,
  FormContainer,
  HeaderText,
  MainContent,
  ReceiveContent,
  Text,
} from "../components/Reusable";
import { OrdinalTxo, useOrds } from "../hooks/useOrds";
import { Show } from "../components/Show";
import { BackButton } from "../components/BackButton";
import { QrCode } from "../components/QrCode";
import { useSnackbar } from "../hooks/useSnackbar";
import { PageLoader } from "../components/PageLoader";
import validate from "bitcoin-address-validation";
import { Input } from "../components/Input";
import { sleep } from "../utils/sleep";
import { useTheme } from "../hooks/useTheme";
import { Ordinal } from "../components/Ordinal";

const OrdinalsList = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
`;

const NoInscriptionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 8rem;
  width: 100%;
`;

const OneSatLogo = styled.img`
  width: 3rem;
  height: 3rem;
  margin: 0 0 1rem 0;
`;

const Icon = styled.img<{ size?: string }>`
  width: ${(props) => props.size ?? "1.5rem"};
  height: ${(props) => props.size ?? "1.5rem"};
  margin: 0 0.5rem 0 0;
`;

type PageState = "main" | "receive" | "transfer";

export const OrdWallet = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const {
    ordAddress,
    ordinals,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
    getOrdinalsBaseUrl,
  } = useOrds();
  const [selectedOrdinal, setSelectedOrdinal] = useState<
    OrdinalTxo | undefined
  >();
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
      resetSendState();
      setPageState("main");
      getOrdinals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    await sleep(25);
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
          <NoInscriptionWrapper>
            <OneSatLogo src={oneSatLogo} />
            <Text
              style={{
                color: theme.white,
                fontSize: "1rem",
              }}
            >
              You have no 1Sat Ordinals. NGMI 😬
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <OrdinalsList>
          {ordinals
            .filter((o) => o.data?.insc?.file.type !== "application/bsv-20")
            .map((ord) => {
              return (
                <Ordinal
                  theme={theme}
                  inscription={ord}
                  key={ord.origin?.outpoint.toString()}
                  url={`${getOrdinalsBaseUrl()}/content/${ord.outpoint.toString()}`}
                  selected={
                    selectedOrdinal?.origin?.outpoint.toString() ===
                    ord.origin?.outpoint.toString()
                  }
                  onClick={() => {
                    setSelectedOrdinal(ord);
                    setOrdinalOutpoint(ord.outpoint.toString());
                  }}
                />
              );
            })}
        </OrdinalsList>
      </Show>
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
          label="Transfer"
          onClick={async () => {
            if (!selectedOrdinal?.outpoint.toString()) {
              addSnackbar("You must select an ordinal to transfer!", "info");
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
      <Icon size={"2.5rem"} src={oneSatLogo} />
      <HeaderText style={{ marginTop: "1rem" }} theme={theme}>
        Only Send 1Sat Ordinals
      </HeaderText>
      <Text theme={theme} style={{ marginBottom: "1rem" }}>
        Do not send BSV to this address!
      </Text>
      <QrCode address={ordAddress} onClick={handleCopyToClipboard} />
      <Text
        theme={theme}
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
        <HeaderText theme={theme}>Transfer Ordinal</HeaderText>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinal as OrdinalTxo}
          url={`${getOrdinalsBaseUrl()}/content/${selectedOrdinal?.outpoint.toString()}`}
          selected={true}
          size="6rem"
        />
        <FormContainer noValidate onSubmit={(e) => handleTransferOrdinal(e)}>
          <Input
            theme={theme}
            placeholder="Receive Address"
            type="text"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Input
            theme={theme}
            placeholder="Password"
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
            label="Transfer Now"
            disabled={isProcessing}
            isSubmit
          />
        </FormContainer>
      </ConfirmContent>
    </>
  );

  return (
    <>
      <Show when={isProcessing && pageState === "main"}>
        <PageLoader theme={theme} message="Loading ordinals..." />
      </Show>
      <Show when={isProcessing && pageState === "transfer"}>
        <PageLoader theme={theme} message="Transferring Ordinal..." />
      </Show>
      <Show when={!isProcessing && pageState === "main"}>{main}</Show>
      <Show when={!isProcessing && pageState === "receive"}>{receive}</Show>
      <Show when={!isProcessing && pageState === "transfer"}>{transfer}</Show>
    </>
  );
};
