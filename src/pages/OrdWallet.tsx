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
  ReceiveContent,
  Text,
} from "../components/Reusable";
import { BSV20, useOrds } from "../hooks/useOrds";
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
import Tabs from "../components/Tabs";
import { OrdinalTxo } from "../hooks/ordTypes";
import { normalize, showAmount } from "../utils/ordi";
import { BSV20Item } from "../components/BSV20Item";

const OrdinalsList = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
`;

const BSV20List = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
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

const TransferWrapper = styled.div`
  margin-top: -2rem;
  width: 100%;
`;

const TransferBSV20Header = styled(HeaderText)`
  overflow: hidden;
  max-width: 16rem;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const OrdButtonContainer = styled(ButtonContainer)`
  margin: 0.5rem 0 0.5rem 0;
`;


type PageState = "main" | "receive" | "transfer" | "sendBSV20";

export const OrdWallet = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>("main");
  const {
    bsv20s,
    ordAddress,
    ordinals,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
    getOrdinalsBaseUrl,
    sendBSV20,
  } = useOrds();
  const [selectedOrdinal, setSelectedOrdinal] = useState<
    OrdinalTxo | undefined
  >();
  const [tabIndex, selectTab] = useState(0);
  const [ordinalOutpoint, setOrdinalOutpoint] = useState("");
  const [receiveAddress, setReceiveAddress] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  const { addSnackbar, message } = useSnackbar();
  // bsv20 state

  const [token, setToken] = useState<BSV20 | null>(null);
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);

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

  const handleSendBSV20 = async (e: React.FormEvent<HTMLFormElement>) => {
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

    if (token === null || tokenSendAmount === null) {
      setIsProcessing(false);
      return;
    }

    const sendBSV20Res = await sendBSV20(
      token.tick,
      receiveAddress,
      BigInt(tokenSendAmount),
      passwordConfirm
    );

    console.log("sendBSV20Res", sendBSV20Res);

    if (!sendBSV20Res.txid || sendBSV20Res.error) {
      const message =
        sendBSV20Res.error === "invalid-password"
          ? "Invalid Password!"
          : sendBSV20Res.error === "insufficient-funds"
          ? "Insufficient Funds!"
          : sendBSV20Res.error === "no-bsv20-utxo"
          ? "No bsv20 token found!"
          : "An unknown error has occurred! Try again.";

      addSnackbar(message, "error");
      return;
    }

    setSuccessTxId(sendBSV20Res.txid);
    addSnackbar(
      "Token sent Successful! It may continue to show in your wallet until the tx is confirmed.",
      "success"
    );
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(ordAddress).then(() => {
      addSnackbar("Copied!", "success");
    });
  };

  const nft = (
    <>
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
            .filter(
              (o) => o.origin?.data?.insc?.file.type !== "application/bsv-20"
            )
            .map((ord) => {
              return (
                <Ordinal
                  theme={theme}
                  inscription={ord}
                  key={ord.origin?.outpoint.toString()}
                  url={`${getOrdinalsBaseUrl()}/content/${ord.origin?.outpoint.toString()}`}
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
      <OrdButtonContainer>
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
      </OrdButtonContainer>
    </>
  );

  const ft = (
    <>
      <Show
        when={bsv20s.length > 0}
        whenFalseContent={
          <NoInscriptionWrapper>
            <OneSatLogo src={oneSatLogo} />
            <Text
              style={{
                color: theme.white,
                fontSize: "1rem",
              }}
            >
              You have no BSV-20 tokens. NGMI 😬
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <BSV20List>
          {bsv20s.map((b) => {
            return (
              <BSV20Item
                theme={theme}
                tick={b.tick}
                amount={showAmount(b.all.confirmed, b.dec)}
                key={b.tick}
                selected={false}
                onClick={async () => {
                  setToken(b);
                  setPageState("sendBSV20");
                }}
              />
            );
          })}
        </BSV20List>
      </Show>
    </>
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
    <TransferWrapper>
      <BackButton
        onClick={() => {
          setPageState("main");
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText style={{ fontSize: "1.35rem" }} theme={theme}>{`${
          selectedOrdinal?.origin?.data?.map?.name ??
          selectedOrdinal?.origin?.data?.map?.subTypeData?.name ??
          "Transfer Ordinal"
        }`}</HeaderText>
        <Text
          style={{ margin: 0 }}
          theme={theme}
        >{`#${selectedOrdinal?.origin?.num}`}</Text>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinal as OrdinalTxo}
          url={`${getOrdinalsBaseUrl()}/content/${selectedOrdinal?.origin?.outpoint.toString()}`}
          selected
          isTransfer
        />
        <FormContainer noValidate onSubmit={(e) => handleTransferOrdinal(e)}>
          <Input
            theme={theme}
            placeholder="Receive Address"
            type="text"
            name="address"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Input
            theme={theme}
            placeholder="Password"
            name="password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <Text theme={theme} style={{ margin: "1rem 0 0 0" }}>
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
    </TransferWrapper>
  );

  const main = (
    <Tabs tabIndex={tabIndex} selectTab={selectTab} theme={theme}>
      <Tabs.Panel theme={theme} label="NFT">
        {nft}
      </Tabs.Panel>
      <Tabs.Panel theme={theme} label="Tokens">
        {ft}
      </Tabs.Panel>
    </Tabs>
  );

  const sendBSV20View = (
    <Show when={token !== null}>
      <BackButton
        onClick={() => {
          setPageState("main");
        }}
      />
      {token ? (
        <ConfirmContent>
          <TransferBSV20Header theme={theme}>
            Send {token.tick}
          </TransferBSV20Header>
          <Text
            theme={theme}
            style={{ cursor: "pointer" }}
          >{`Available Balance: ${showAmount(
            token.all.confirmed,
            token.dec
          ).toString()}`}</Text>
          <FormContainer noValidate onSubmit={(e) => handleSendBSV20(e)}>
            <Input
              theme={theme}
              name="address"
              placeholder="Receive Address"
              type="text"
              onChange={(e) => setReceiveAddress(e.target.value)}
              value={receiveAddress}
            />
            <Input
              name="amt"
              theme={theme}
              placeholder="Enter Token Amount"
              type="number"
              step={"1"}
              value={
                tokenSendAmount !== null
                  ? showAmount(tokenSendAmount, token.dec)
                  : ""
              }
              onChange={(e) => {
                const inputValue = e.target.value;

                if (inputValue === "") {
                  setTokenSendAmount(null);
                } else {
                  const amtStr = normalize(inputValue, token.dec);

                  const amt = BigInt(amtStr);
                  setTokenSendAmount(amt);
                  if (amt > token.all.confirmed) {
                    setTimeout(() => {
                      setTokenSendAmount(token.all.confirmed);
                    }, 500);
                  }
                }
              }}
            />
            <Input
              theme={theme}
              name="password"
              placeholder="Password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
            <Text theme={theme} style={{ margin: "1rem 0 0 0" }}>
              Double check details before sending.
            </Text>
            <Button
              theme={theme}
              type="primary"
              label="Send"
              disabled={isProcessing}
              isSubmit
            />
          </FormContainer>
        </ConfirmContent>
      ) : (
        <></>
      )}
    </Show>
  );

  return (
    <>
      <Show when={isProcessing && pageState === "main"}>
        <PageLoader theme={theme} message="Loading ordinals..." />
      </Show>
      <Show when={isProcessing && pageState === "transfer"}>
        <PageLoader theme={theme} message="Transferring Ordinal..." />
      </Show>
      <Show when={isProcessing && pageState === "sendBSV20"}>
        <PageLoader theme={theme} message="Sending BSV20..." />
      </Show>
      <Show when={!isProcessing && pageState === "main"}>{main}</Show>
      <Show when={!isProcessing && pageState === "receive"}>{receive}</Show>
      <Show when={!isProcessing && pageState === "transfer"}>{transfer}</Show>
      <Show when={!isProcessing && pageState === "sendBSV20"}>
        {sendBSV20View}
      </Show>
    </>
  );
};
