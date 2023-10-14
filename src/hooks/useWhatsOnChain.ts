import axios from "axios";
import { BSV_DECIMAL_CONVERSION, WOC_BASE_URL, WOC_TESTNET_BASE_URL } from "../utils/constants";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";
export type UTXO = {
  satoshis: number;
  vout: number;
  txid: string;
  script: string;
};

export type WocUtxo = {
  height: number;
  tx_pos: number;
  tx_hash: string;
  value: number;
};

export const useWhatsOnChain = () => {

  const { network } = useNetwork();


  const getBaseUrl = () => {
    return network === NetWork.Mainnet ? WOC_BASE_URL : WOC_TESTNET_BASE_URL;
  };

  const getBsvBalance = async (address: string) => {
    try {
      const { data } = await axios.get(
        `${getBaseUrl()}/address/${address}/balance`
      );
      const satBalance = data.confirmed + data.unconfirmed;
      const total = satBalance / BSV_DECIMAL_CONVERSION;
      return total;
    } catch (error) {
      console.log(error);
    }
  };

  const getUtxos = async (fromAddress: string) => {
    try {
      const { data } = await axios.get(
        `${getBaseUrl()}/address/${fromAddress}/unspent`
      );

      return data;
    } catch (error) {
      console.log(error);
    }
  };

  const getExchangeRate = async () => {
    try {
      const { data } = await axios.get(`${getBaseUrl()}/exchangerate`);
      const rate = Number(data.rate.toFixed(2));
      return rate;
    } catch (error) {
      console.log(error);
    }
  };

  const getRawTxById = async (txid: string): Promise<string | undefined> => {
    try {
      const { data } = await axios.get(`${getBaseUrl()}/tx/${txid}/hex`);
      return data;
    } catch (error) {
      console.log(error);
    }
  };

  const broadcastRawTx = async (txhex: string): Promise<string | undefined> => {
    try {
      const { data: txid } = await axios.post(`${getBaseUrl()}/tx/raw`, {
        txhex,
      });
      return txid;
    } catch (error) {
      console.log(error);
    }
  };

  return {
    getUtxos,
    getBsvBalance,
    getExchangeRate,
    getRawTxById,
    broadcastRawTx,
  };
};
