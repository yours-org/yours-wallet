import axios from 'axios';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { chunkedStringArray } from '../utils/format';
import { NetWork } from '../utils/network';
import { isBSV20v2 } from '../utils/ordi';
import { OrdinalResponse, OrdinalTxo } from './ordTypes';
import { useNetwork } from './useNetwork';
import { BSV20 } from './useOrds';
import { useTokens } from './useTokens';

type GorillaPoolErrorMessage = {
  message: string;
};

export type GorillaPoolBroadcastResponse = {
  txid?: string;
  message?: string;
};

export const useGorillaPool = () => {
  const { network, isAddressOnRightNetwork } = useNetwork();
  const { getTokenDecimals, getTokenSym } = useTokens();

  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getOrdUtxos = async (ordAddress: string): Promise<OrdinalResponse> => {
    try {
      console.log(!isAddressOnRightNetwork(ordAddress), ordAddress);

      if (!isAddressOnRightNetwork(ordAddress)) return [];
      const { data } = await axios.get<OrdinalTxo[]>(
        `${getOrdinalsBaseUrl()}/api/txos/address/${ordAddress}/unspent?limit=100&offset=0`,
      );
      return data;
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  const broadcastWithGorillaPool = async (txhex: string): Promise<GorillaPoolBroadcastResponse> => {
    try {
      const encoded = Buffer.from(txhex, 'hex').toString('base64');
      const res = await axios.post<string | GorillaPoolErrorMessage>(`${getOrdinalsBaseUrl()}/api/tx`, {
        rawtx: encoded,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        return { txid: res.data };
      } else {
        return res.data as GorillaPoolErrorMessage;
      }
    } catch (error) {
      console.log(error);
      return { message: JSON.stringify(error) };
    }
  };

  const submitTx = async (txid: string) => {
    try {
      let res = await axios.post(`${getOrdinalsBaseUrl()}/api/tx/${txid}/submit`);

      if (res.status !== 0) {
        console.error('submitTx failed: ', txid);
      }
    } catch (error) {
      console.error('submitTx failed: ', txid, error);
    }
  };

  const getUtxoByOutpoint = async (outpoint: string): Promise<OrdinalTxo> => {
    try {
      const { data } = await axios.get(`${getOrdinalsBaseUrl()}/api/txos/${outpoint}?script=true`);
      const ordUtxo: OrdinalTxo = data;
      if (!ordUtxo.script) throw Error('No script when fetching by outpoint');
      ordUtxo.script = Buffer.from(ordUtxo.script, 'base64').toString('hex');
      return ordUtxo;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  const getMarketData = async (outpoint: string) => {
    try {
      const res = await axios.get(`${getOrdinalsBaseUrl()}/api/inscriptions/${outpoint}?script=true`);
      const data = res.data as OrdinalTxo;
      if (!data?.script || !data.origin?.outpoint.toString()) throw new Error('Could not get listing script');
      return { script: data.script, origin: data.origin.outpoint.toString() };
    } catch (error) {
      throw new Error(`Error getting market data: ${JSON.stringify(error)}`);
    }
  };

  const getBsv20Balances = async (ordAddress: string) => {
    if (!isAddressOnRightNetwork(ordAddress)) return [];
    const res = await axios.get(`${getOrdinalsBaseUrl()}/api/bsv20/${ordAddress}/balance`);

    const bsv20List: Array<BSV20> = res.data.map(
      (b: {
        all: {
          confirmed: string;
          pending: string;
        };
        listed: {
          confirmed: string;
          pending: string;
        };
        tick: string;
      }) => {
        return {
          tick: b.tick,
          sym: getTokenSym(b.tick),
          dec: getTokenDecimals(b.tick),
          all: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          },
          listed: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          },
        };
      },
    );

    return bsv20List;
  };

  const getBSV20Utxos = async (tick: string, address: string): Promise<OrdinalTxo[] | undefined> => {
    try {
      if (!address) {
        return [];
      }

      const url = isBSV20v2(tick)
        ? `${getOrdinalsBaseUrl()}/api/bsv20/${address}/id/${tick}`
        : `${getOrdinalsBaseUrl()}/api/bsv20/${address}/tick/${tick}`;

      const r = await axios.get(url);

      if (!Array.isArray(r.data)) {
        return [];
      }

      const utxos = await Promise.all(
        r.data
          .map((utxo: any) => {
            return getUtxoByOutpoint(utxo.outpoint);
          })
          .filter((u) => u !== null),
      );

      return utxos as OrdinalTxo[];
    } catch (error) {
      console.error('getBSV20Utxos', error);
      return [];
    }
  };

  const getLockedUtxos = async (address: string) => {
    try {
      if (!isAddressOnRightNetwork(address)) return [];
      //TODO: use this instead of test endpoint - `${getOrdinalsBaseUrl()}/api/locks/address/${address}/unspent?limit=100&offset=0`
      const { data } = await axios.get(
        `https://locks.gorillapool.io/api/locks/address/${address}/unspent?limit=100&offset=0`,
      );
      const lockedUtxos: OrdinalTxo[] = data;
      return lockedUtxos;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  const getSpentTxids = async (outpoints: string[]): Promise<Map<string, string>> => {
    try {
      const chunks = chunkedStringArray(outpoints, 50);
      let spentTxids = new Map<string, string>();
      for (const chunk of chunks) {
        try {
          //TODO: updata url to be dynamic for testnet
          const res = await axios.post(`https://locks.gorillapool.io/api/spends`, chunk);
          const txids = res.data as string[];
          txids.forEach((txid, i) => {
            spentTxids.set(chunk[i], txid);
          });
        } catch (error) {}
      }
      return spentTxids;
    } catch (error) {
      console.log(error);
      return new Map();
    }
  };

  return {
    getOrdUtxos,
    broadcastWithGorillaPool,
    getUtxoByOutpoint,
    getMarketData,
    getBsv20Balances,
    getBSV20Utxos,
    getLockedUtxos,
    getSpentTxids,
    submitTx,
  };
};
