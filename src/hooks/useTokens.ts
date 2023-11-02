import axios from 'axios';
import { useEffect, useState } from 'react';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { NetWork } from '../utils/network';
import { useNetwork } from './useNetwork';
import { storage } from '../utils/storage';
import { isBSV20v2 } from '../utils/ordi';

export type TokenStorage = {
  tick: string;
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

  const retrieveTokens = (): Promise<Array<TokenStorage>> => {
    return new Promise((resolve, _) => {
      const key = `tokens_${network}`;
      storage.get([key], async (result: any) => {
        try {
          if (!result || !result[key]) {
            resolve([]);
            return;
          }

          const tokenInfos = result[key];

          setTokens(tokenInfos);
          resolve(tokenInfos);
        } catch (error) {
          storage.remove(key);
          resolve([]);
        }
      });
    });
  };

  const cacheTokenInfos = async (ticks: Array<string>) => {
    return new Promise(async (reslove, reject) => {
      try {
        const tokenInfos = (
          await Promise.all(
            ticks.map(async (tick) => {
              const token = tokens.find((t) => t !== null && t.tick === tick);
              if (token) {
                return token;
              }

              if (isBSV20v2(tick)) {
                const r = await axios.get(`${getOrdinalsBaseUrl()}/api/inscriptions/${tick}`);

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
                  tick,
                  decimals: parseInt(dec || '0'),
                  max: amt,
                  sym,
                  txid,
                  vout,
                  version: 2,
                } as TokenStorage;
              } else {
                try {
                  const r = await axios.get(`${getOrdinalsBaseUrl()}/api/bsv20/tick/${tick}`);

                  if (r.status !== 200 || typeof r.data !== 'object') {
                    return null;
                  }

                  const { max, lim, txid, vout, dec } = r.data;

                  return {
                    tick,
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

        storage.set(
          {
            [`tokens_${network}`]: tokenInfos,
          },
          () => {
            setTokens(tokenInfos);
            reslove(tokenInfos);
          },
        );
      } catch (error) {
        console.error('cacheTokens failed: ', error);
        reject(error);
      }
    });
  };

  const getTokenInfo = (tick: string): Promise<TokenStorage | undefined> => {
    return new Promise(async (resolve, reject) => {
      const tokenInfo = tokens.find((t) => t.tick === tick);
      if (tokenInfo) {
        resolve(tokenInfo);
      } else {
        const tokenInfos = await retrieveTokens();

        const tokenInfo = tokenInfos.find((t) => t.tick === tick);

        if (tokenInfo) {
          resolve(tokenInfo);
        }
      }
      resolve(undefined);
    });
  };

  const getTokenDecimals = (tick: string) => {
    const tokenInfo = tokens.find((t) => t.tick === tick);
    return tokenInfo?.decimals || 0;
  };

  const getTokenSym = (tick: string) => {
    const tokenInfo = tokens.find((t) => t.tick === tick);
    return tokenInfo?.sym || tick;
  };

  return {
    tokens,
    cacheTokenInfos,
    getTokenInfo,
    getTokenDecimals,
    getTokenSym,
  };
};
