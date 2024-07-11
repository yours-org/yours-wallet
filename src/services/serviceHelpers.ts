import { ChainParams } from 'bsv-wasm-web';
import { NetWork } from 'yours-wallet-provider';

export const getChainParams = (network: NetWork): ChainParams => {
  return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deepMerge = <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = {} as T[keyof T];
      }
      deepMerge(target[key], source[key] as Partial<T[keyof T]>);
    } else {
      target[key] = source[key] as T[keyof T];
    }
  }
  return target;
};
