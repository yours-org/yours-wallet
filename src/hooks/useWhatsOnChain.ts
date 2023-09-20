import axios from "axios";
import { BSV_DECIMAL_CONVERSION, WOC_BASE_URL } from "../utils/constants";
import { Script } from "bsv";
export type UTXO = {
  satoshis: number;
  vout: number;
  txid: string;
  script: string;
};

type WocUtxo = {
  height: number;
  tx_pos: number;
  tx_hash: string;
  value: number;
};

export const useWhatsOnChain = () => {
  const getBsvBalance = async (address: string) => {
    const { data } = await axios.get(
      `${WOC_BASE_URL}/address/${address}/balance`
    );
    const satBalance = data.confirmed + data.unconfirmed;
    const total = satBalance / BSV_DECIMAL_CONVERSION;
    return total;
  };

  const getUxos = async (fromAddress: string) => {
    const { data } = await axios.get(
      `${WOC_BASE_URL}/address/${fromAddress}/unspent`
    );

    const script = Script.fromAddress(fromAddress).toHex();

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

  const getExchangeRate = async () => {
    const { data } = await axios.get(`${WOC_BASE_URL}/exchangerate`);
    const rate = Number(data.rate.toFixed(2));
    return rate;
  };

  const getRawTxById = async (txid: string): Promise<string> => {
    const { data } = await axios.get(`${WOC_BASE_URL}/tx/${txid}/hex`);
    return data;
  };

  const broadcastRawTx = async (txhex: string): Promise<string> => {
    // Broadcast to miners
    const { data: txid } = await axios.post(`${WOC_BASE_URL}/tx/raw`, {
      txhex,
    });
    return txid;
  };

  return {
    getUxos,
    getBsvBalance,
    getExchangeRate,
    getRawTxById,
    broadcastRawTx,
  };
};
