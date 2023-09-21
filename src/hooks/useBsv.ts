import { useEffect, useState } from "react";
import { useKeys } from "./useKeys";
import * as bsv from "bsv";
import { UTXO, useWhatsOnChain } from "./useWhatsOnChain";

type SendBsvResponse = {
  txid?: string;
  error?: string;
};

export const useBsv = () => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { getUxos, getBsvBalance, getExchangeRate, broadcastRawTx } =
    useWhatsOnChain();
  const { retrieveKeys, bsvAddress, verifyPassword } = useKeys();

  const sendBsv = async (
    toAddress: string,
    amount: number,
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

      // Format in and outs
      const utxos = await getUxos(fromAddress);
      const totalSats = utxos.reduce((a, item) => a + item.satoshis, 0);
      if (totalSats < amount) {
        return { error: "insufficient-funds" };
      }

      const sendAll = totalSats === amount;
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = getInputs(utxos, satsOut);

      const totalInputSats = inputs.reduce((a, item) => a + item.satoshis, 0);

      // Build tx
      const bsvTx = bsv.Transaction().from(inputs);
      bsvTx.to(toAddress, satsOut);
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

  const getInputs = (utxos: UTXO[], satsOut: number) => {
    let sum = 0;
    let index = 0;
    let inputs: UTXO[] = [];

    while (sum < satsOut) {
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
    isProcessing,
    sendBsv,
    setIsProcessing,
    getBsvBalance,
    exchangeRate,
  };
};
