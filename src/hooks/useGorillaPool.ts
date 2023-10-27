import axios from "axios";
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from "../utils/constants";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";
import { OrdinalResponse, OrdinalTxo } from "./useOrds";
import { Script } from "bsv-wasm-web";

type GorillaPoolErrorMessage = {
  message: string;
};

export type GorillaPoolBroadcastResponse = {
  txid?: string;
  message?: string;
};

export const useGorillaPool = () => {
  const { network } = useNetwork();

  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getOrdUtxos = async (ordAddress: string): Promise<OrdinalResponse> => {
    try {
      const { data } = await axios.get<OrdinalTxo[]>(
        `${getOrdinalsBaseUrl()}/api/txos/address/${ordAddress}/unspent?limit=100&offset=0`
      );
      return data;
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  const broadcastWithGorillaPool = async (
    txhex: string
  ): Promise<GorillaPoolBroadcastResponse> => {
    try {
      const encoded = Buffer.from(txhex, "hex").toString("base64");
      const res = await axios.post<string | GorillaPoolErrorMessage>(
        `${getOrdinalsBaseUrl()}/api/tx`,
        {
          rawtx: encoded,
        }
      );
      if (res.status === 200 && typeof res.data === "string") {
        return { txid: res.data };
      } else {
        return res.data as GorillaPoolErrorMessage;
      }
    } catch (error) {
      console.log(error);
      return { message: JSON.stringify(error) };
    }
  };

  const getUtxoByOutpoint = async (outpoint: string): Promise<OrdinalTxo> => {
    try {
      const { data } = await axios.get(
        `${getOrdinalsBaseUrl()}/api/txos/${outpoint}?script=true`
      );
      const ordUtxo = data;

      ordUtxo.script = Script.from_bytes(
        Buffer.from(ordUtxo.script, "base64")
      ).to_asm_string();

      return ordUtxo;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  const getMarketData = async (outpoint: string) => {
    try {
      const res = await axios.get(
        `${getOrdinalsBaseUrl()}/api/inscriptions/${outpoint}?script=true`
      );
      const data = res.data as OrdinalTxo;
      if (!data?.script || !data.origin?.outpoint.toString())
        throw new Error("Could not get listing script");
      return { script: data.script, origin: data.origin.outpoint.toString() };
    } catch (error) {
      throw new Error(`Error getting market data: ${JSON.stringify(error)}`);
    }
  };

  return {
    getOrdUtxos,
    broadcastWithGorillaPool,
    getUtxoByOutpoint,
    getMarketData,
  };
};
