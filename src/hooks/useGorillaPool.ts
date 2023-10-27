import axios from "axios";
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from "../utils/constants";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";
import { OrdinalResponse, OrdinalTxo } from "./useOrds";

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

  return {
    getOrdUtxos,
    broadcastWithGorillaPool,
  };
};
