import axios from 'axios';
import { BSV_DECIMAL_CONVERSION, WOC_BASE_URL, WOC_TESTNET_BASE_URL } from '../utils/constants';
import { NetWork } from '../utils/network';
import { useNetwork } from './useNetwork';
import { storage } from '../utils/storage';
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
  const apiKey = process.env.REACT_APP_WOC_API_KEY;
  const config =
    network === NetWork.Mainnet
      ? {
          headers: {
            'woc-api-key': apiKey,
          },
        }
      : undefined;

  const getBaseUrl = () => {
    return network === NetWork.Mainnet ? WOC_BASE_URL : WOC_TESTNET_BASE_URL;
  };

  const getBsvBalance = async (address: string): Promise<number | undefined> => {
    return new Promise((resolve, reject) => {
      storage.get(['cachedBalance'], async ({ cachedBalance }) => {
        try {
          if (
            cachedBalance?.amount !== null &&
            cachedBalance?.amount !== undefined &&
            Date.now() - cachedBalance.timestamp < 5000
          ) {
            resolve(Number(cachedBalance.amount));
          } else {
            const res = await axios.get(`${getBaseUrl()}/address/${address}/balance`, config);
            if (!res.data) {
              throw new Error('Could not fetch balance from WOC!');
            }
            const satBalance = res.data.confirmed + res.data.unconfirmed;
            const total = satBalance / BSV_DECIMAL_CONVERSION;
            const currentTime = Date.now();
            storage.set({ cachedBalance: { amount: total, timestamp: currentTime } });
            resolve(total);
          }
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });
    });
  };

  const getUtxos = async (fromAddress: string): Promise<WocUtxo[]> => {
    try {
      const { data } = await axios.get(`${getBaseUrl()}/address/${fromAddress}/unspent`, config);

      return data;
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  const getExchangeRate = async (): Promise<number | undefined> => {
    return new Promise((resolve, reject) => {
      storage.get(['exchangeRateCache'], async ({ exchangeRateCache }) => {
        try {
          if (exchangeRateCache?.rate && Date.now() - exchangeRateCache.timestamp < 5 * 60 * 1000) {
            resolve(Number(exchangeRateCache.rate.toFixed(2)));
          } else {
            const res = await axios.get(`${getBaseUrl()}/exchangerate`, config);
            if (!res.data) {
              throw new Error('Could not fetch exchange rate from WOC!');
            }

            const rate = Number(res.data.rate.toFixed(2));
            const currentTime = Date.now();
            storage.set({ exchangeRateCache: { rate, timestamp: currentTime } });
            resolve(rate);
          }
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });
    });
  };

  const getRawTxById = async (txid: string): Promise<string | undefined> => {
    try {
      const { data } = await axios.get(`${getBaseUrl()}/tx/${txid}/hex`, config);
      return data;
    } catch (error) {
      console.log(error);
    }
  };

  const broadcastRawTx = async (txhex: string): Promise<any> => {
    try {
      const { data: txid } = await axios.post(`${getBaseUrl()}/tx/raw`, { txhex }, config);
      return txid;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Access to config, request, and response
        console.error('broadcast rawtx failed:', error.response.data);
      } else {
        console.error('broadcast rawtx failed:', error);
      }
    }
  };

  const getSuitableUtxo = (utxos: WocUtxo[], minimum: number) => {
    const suitableUtxos = utxos.filter((utxo) => utxo.value > minimum);

    if (suitableUtxos.length === 0) {
      throw new Error('No UTXO large enough for this transaction');
    }
    // Select a random UTXO from the suitable ones
    const randomIndex = Math.floor(Math.random() * suitableUtxos.length);
    return suitableUtxos[randomIndex];
  };

  return {
    getUtxos,
    getBsvBalance,
    getExchangeRate,
    getRawTxById,
    broadcastRawTx,
    getSuitableUtxo,
  };
};
