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
import { sleep } from "../../utils/sleep";
import { useTheme } from "../../hooks/useTheme";
import { Web3BroadcastRequest, useBsv } from "../../hooks/useBsv";
import { storage } from "../../utils/storage";
import { useNavigate } from "react-router-dom";
import { useWhatsOnChain } from "../../hooks/useWhatsOnChain";

export type BroadcastResponse = {
  txid: string;
};

export type BroadcastRequestProps = {
  request: Web3BroadcastRequest;
  popupId: number | undefined;
  onBroadcast: () => void;
};

export const BroadcastRequest = (props: BroadcastRequestProps) => {
  const { request, onBroadcast, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [txid, setTxid] = useState("");
  const { addSnackbar, message } = useSnackbar();
  const navigate = useNavigate();

  const { broadcastRawTx } = useWhatsOnChain();
  const { isProcessing, setIsProcessing } = useBsv();

  useEffect(() => {
    setSelected("bsv");
  }, [setSelected]);

  useEffect(() => {
    if (!txid) return;
    if (!message && txid) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, txid]);

  const resetSendState = () => {
    setTxid("");
    setIsProcessing(false);
  };

  const handleBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    const txid = await broadcastRawTx(request.rawtx);
    if (!txid) {
      addSnackbar("Error broadcasting the raw tx!", "error");
      setIsProcessing(false);
      return;
    }

    addSnackbar("Successfully broadcasted the tx!", "success");
    setTxid(txid);
    onBroadcast();

    chrome.runtime.sendMessage({
      action: "broadcastResponse",
      txid,
    });

    if (!txid && popupId) chrome.windows.remove(popupId);
    storage.remove("broadcastRequest");
    navigate("/bsv-wallet");
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Broadcasting transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Broadcast Raw Tx</HeaderText>
          <Text theme={theme} style={{ margin: "0.75rem 0" }}>
            The app is requesting to broadcast a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleBroadcast(e)}>
            <Button
              theme={theme}
              type="primary"
              label="Broadcast Now"
              disabled={isProcessing}
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
