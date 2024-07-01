import axios from 'axios';
import { useEffect, useState } from 'react';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { NetWork } from '../utils/network';
import { useNetwork } from './useNetwork';
import { storage } from '../utils/storage';
import { isBSV20v2 } from '../utils/ordi';

export type TokenStorage = {
  id: string;
  tick?: string;
  decimals: number;
  sym?: string;
  max: string;
  lim?: string;
  txid: string;
  vout: number;
  version: number;
};

export const useTokens = () => {
  const [tokens, setTokens] = useState<TokenStorage[]>([]);

  const { network } = useNetwork();
  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  useEffect(() => {
    retrieveTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retrieveTokens = async (): Promise<Array<TokenStorage>> => {
    const key = `tokens_${network}`;
    try {
      const result = await storage.get([key]);
      if (!result || !result[key]) {
        return [];
      }

      const tokenInfos = result[key];

      setTokens(tokenInfos);
      return tokenInfos;
    } catch (error) {
      await storage.remove(key);
      return [];
    }
  };

  const cacheTokenInfos = async (ids: Array<string>) => {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      try {
        const tokenInfos = (
          await Promise.all(
            ids.map(async (id) => {
              const token = tokens.find((t) => t !== null && t.id === id);
              if (token) {
                return token;
              }

              if (isBSV20v2(id)) {
                const r = await axios.get(`${getOrdinalsBaseUrl()}/api/inscriptions/${id}`);

                if (
                  r.status !== 200 ||
                  typeof r.data !== 'object' ||
                  typeof r.data.data !== 'object' ||
                  typeof r.data.data.insc !== 'object' ||
                  typeof r.data.data.insc.json !== 'object'
                ) {
                  return null;
                }

                const { txid, vout } = r.data;

                const { amt, dec, op, sym } = r.data.data.insc.json;
                if (op !== 'deploy+mint') {
                  return null;
                }

                return {
                  id,
                  decimals: parseInt(dec || '0'),
                  max: amt,
                  sym,
                  txid,
                  vout,
                  version: 2,
                } as TokenStorage;
              } else {
                try {
                  const r = await axios.get(`${getOrdinalsBaseUrl()}/api/bsv20/tick/${id}`);

                  if (r.status !== 200 || typeof r.data !== 'object') {
                    return null;
                  }

                  const { max, lim, txid, vout, dec } = r.data;

                  return {
                    id,
                    tick: id,
                    decimals: dec || 0,
                    max,
                    lim,
                    txid,
                    vout,
                    version: 1,
                  } as TokenStorage;
                } catch (error) {
                  return null;
                }
              }
            }),
          )
        ).filter((t) => t !== null) as Array<TokenStorage>;

        await storage.set({ [`tokens_${network}`]: tokenInfos });
        setTokens(tokenInfos);
        resolve(tokenInfos);
      } catch (error) {
        console.error('cacheTokens failed: ', error);
        reject(error);
      }
    });
  };

  const getTokenInfo = async (id: string): Promise<TokenStorage | undefined> => {
    const tokenInfo = tokens.find((t) => t.id === id);
    if (tokenInfo) {
      return tokenInfo;
    } else {
      const tokenInfos = await retrieveTokens();
      const tokenInfo = tokenInfos.find((t) => t.id === id);

      if (tokenInfo) {
        return tokenInfo;
      }
    }
    return;
  };

  const getTokenDecimals = (id: string) => {
    const tokenInfo = tokens.find((t) => t.id === id);
    return tokenInfo?.decimals || 0;
  };

  const getTokenSym = (id: string) => {
    const tokenInfo = tokens.find((t) => t.id === id);
    return tokenInfo?.sym || id;
  };

  return {
    tokens,
    cacheTokenInfos,
    getTokenInfo,
    getTokenDecimals,
    getTokenSym,
  };
};
