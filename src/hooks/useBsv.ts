import { useEffect, useState } from "react";
import { BSV_DECIMAL_CONVERSION, WOC_BASE_URL } from "../utils/constants";
import axios from "axios";
import { useKeys } from "./useKeys";
import * as bsv from "bsv";

type WocUtxo = {
  height: number;
  tx_pos: number;
  tx_hash: string;
  value: number;
};

type UTXO = {
  satoshis: number;
  vout: number;
  txid: string;
  script: string;
};

type SendBsvResponse = {
  txid?: string;
  error?: string;
};

export const useBsv = () => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { retrieveKeys, bsvAddress, verifyPassword } = useKeys();

  const sendBsv = async (
    toAddress: string,
    amount: number,
    password: string,
    sendAll?: boolean
  ): Promise<SendBsvResponse> => {
    try {
      // Gather keys for tx
      setIsProcessing(true);
      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        setIsProcessing(false);
        return { error: "invalid-password" };
      }
      const feeSats = 20;
      const keys = await retrieveKeys();
      const paymentPk = bsv.PrivateKey.fromWIF(keys.walletWif);
      const fromAddress = paymentPk.toAddress().toString();

      // Format in and outs
      const utxos = await getUxos(fromAddress);
      const totalSats = utxos.reduce((a, item) => a + item.satoshis, 0);
      if (totalSats < amount) {
        setIsProcessing(false);
        return { error: "insufficient-funds" };
      }
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = getInputs(utxos, satsOut);

      // Build tx
      const bsvTx = bsv.Transaction().from(inputs);
      bsvTx.to(toAddress, satsOut);
      if (!sendAll) {
        const change = totalSats - satsOut - feeSats;
        bsvTx.change(fromAddress, change);
      }

      // Sign and get raw tx
      bsvTx.sign(paymentPk);
      const txhex = bsvTx.toString();

      // Broadcast to miners
      const { data: txid } = await axios.post(`${WOC_BASE_URL}/tx/raw`, {
        txhex,
      });

      return { txid };
    } catch (error: any) {
      return { error: error.message ?? "unknown" };
    } finally {
      setIsProcessing(false);
    }
  };

  const getInputs = (utxos: UTXO[], amount: number) => {
    let sum = 0;
    let index = 0;
    let inputs: UTXO[] = [];

    while (sum < amount) {
      const utxo = utxos[index];
      sum += utxo.satoshis;
      inputs.push(utxo);
      index++;
    }
    return inputs;
  };

  const getUxos = async (fromAddress: string) => {
    const { data } = await axios.get(
      `${WOC_BASE_URL}/address/${fromAddress}/unspent`
    );

    const script = bsv.Script.fromAddress(fromAddress).toHex();

    const fundingUtxos: UTXO[] = data
      .map((utxo: WocUtxo) => {
        return {
          satoshis: utxo.value,
          vout: utxo.tx_pos,
          txid: utxo.tx_hash,
          script,
        };
      })
      .sort((a: UTXO, b: UTXO) => (a.satoshis > b.satoshis ? -1 : 1));

    return fundingUtxos;
  };

  useEffect(() => {
    const getBsvBalance = async () => {
      const keys = await retrieveKeys();
      const { data } = await axios.get(
        `${WOC_BASE_URL}/address/${keys.walletAddress}/balance`
      );
      const satBalance = data.confirmed + data.unconfirmed;
      const total = satBalance / BSV_DECIMAL_CONVERSION;
      setBsvBalance(total);
    };
    getBsvBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    bsvBalance,
    bsvAddress,
    isProcessing,
    sendBsv,
    setIsProcessing,
  };
};
