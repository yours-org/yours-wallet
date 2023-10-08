import { useEffect, useState } from "react";
import { useKeys } from "./useKeys";
import * as bsv from "bsv";
import { UTXO, useWhatsOnChain } from "./useWhatsOnChain";
import { SignMessageResponse } from "../pages/requests/SignMessageRequest";

type SendBsvResponse = {
  txid?: string;
  error?: string;
};

export type Web3SendBsvRequest = {
  satAmount: number;
  address: string;
}[];

export type Web3BroadcastRequest = {
  rawtx: string;
};

export const useBsv = () => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { getUxos, getBsvBalance, getExchangeRate, broadcastRawTx } =
    useWhatsOnChain();
  const { retrieveKeys, bsvAddress, verifyPassword, bsvPubKey } = useKeys();

  const sendBsv = async (
    request: Web3SendBsvRequest,
    password: string
  ): Promise<SendBsvResponse> => {
    try {
      // Gather keys for tx
      setIsProcessing(true);
      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: "invalid-password" };
      }
      const feeSats = 20;
      const keys = await retrieveKeys(password);
      const paymentPk = bsv.PrivateKey.fromWIF(keys.walletWif);
      const fromAddress = paymentPk.toAddress().toString();
      const amount = request.reduce((a, r) => a + r.satAmount, 0);

      // Format in and outs
      const utxos = await getUxos(fromAddress);
      const totalSats = utxos.reduce((a, item) => a + item.satoshis, 0);
      if (totalSats < amount) {
        return { error: "insufficient-funds" };
      }

      const sendAll = totalSats === amount;
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = getInputs(utxos, satsOut, sendAll);

      const totalInputSats = inputs.reduce((a, item) => a + item.satoshis, 0);

      // Build tx
      const bsvTx = bsv.Transaction().from(inputs);
      request.forEach((req) => {
        bsvTx.to(req.address, req.satAmount);
      });

      if (!sendAll) {
        const change = totalInputSats - satsOut - feeSats;
        bsvTx.to(fromAddress, change);
      }
      // Sign and get raw tx
      bsvTx.sign(paymentPk);
      const txhex = bsvTx.toString();

      const txid = await broadcastRawTx(txhex);

      return { txid };
    } catch (error: any) {
      return { error: error.message ?? "unknown" };
    } finally {
      setIsProcessing(false);
    }
  };

  const signMessage = async (
    message: string,
    password: string
  ): Promise<SignMessageResponse | undefined> => {
    const isAuthenticated = await verifyPassword(password);
    if (!isAuthenticated) {
      return { error: "invalid-password" };
    }
    try {
      const keys = await retrieveKeys(password);
      const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
      const privateKey = bsv.PrivateKey.fromWIF(keys.walletWif);
      const signature = bsv.crypto.ECDSA.sign(hash, privateKey, "big");
      const address = privateKey.toAddress().toString();
      return {
        address,
        signedMessage: message,
        signatureHex: signature.toString("hex"),
      };
    } catch (error) {
      console.log(error);
    }
  };

  const verifyMessage = (
    message: string,
    signatureHex: string,
    publicKeyHex: string
  ) => {
    try {
      const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
      const signature = bsv.crypto.Signature.fromDER(
        Buffer.from(signatureHex, "hex")
      );
      const publicKey = bsv.PublicKey.fromHex(publicKeyHex);
      const verified = bsv.crypto.ECDSA.verify(hash, signature, publicKey);
      return verified;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const getInputs = (utxos: UTXO[], satsOut: number, isSendAll: boolean) => {
    if (isSendAll) return utxos;
    let sum = 0;
    let index = 0;
    let inputs: UTXO[] = [];

    while (sum <= satsOut) {
      const utxo = utxos[index];
      sum += utxo.satoshis;
      inputs.push(utxo);
      index++;
    }
    return inputs;
  };

  const balance = async () => {
    const total = await getBsvBalance(bsvAddress);
    setBsvBalance(total);
  };

  const rate = async () => {
    const r = await getExchangeRate();
    setExchangeRate(r);
  };

  useEffect(() => {
    if (!bsvAddress) return;
    balance();
    rate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  return {
    bsvBalance,
    bsvAddress,
    bsvPubKey,
    isProcessing,
    sendBsv,
    setIsProcessing,
    getBsvBalance,
    exchangeRate,
    signMessage,
    verifyMessage,
  };
};
