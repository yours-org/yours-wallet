import { Utils } from '@bsv/sdk';
import { ONESAT_MAINNET_CONTENT_URL, ONESAT_TESTNET_CONTENT_URL } from '@1sat/actions';
import { NetWork } from '../services/types/provider.types';
import { isUri } from './uri';

export type Chain = 'main' | 'test';

const networks = {
  [NetWork.Mainnet]: {
    chain: 'main' as const,
    addressPrefix: 0x00,
    contentUrl: ONESAT_MAINNET_CONTENT_URL,
    explorerUrl: 'https://whatsonchain.com/tx/',
  },
  [NetWork.Testnet]: {
    chain: 'test' as const,
    addressPrefix: 0x6f,
    contentUrl: ONESAT_TESTNET_CONTENT_URL,
    explorerUrl: 'https://test.whatsonchain.com/tx/',
  },
};

export const getNetworkConfig = (network = NetWork.Mainnet) => networks[network];
export const getNetwork = (chain: Chain) => (chain === 'test' ? NetWork.Testnet : NetWork.Mainnet);
export const getChainConfig = (chain: Chain) => getNetworkConfig(getNetwork(chain));

export const resolveContentUrl = (ref: string, chain: Chain) =>
  isUri(ref) ? ref : `${getChainConfig(chain).contentUrl}/${ref}`;

export const toNetworkAddress = (address: string, network: NetWork): string =>
  Utils.toBase58Check(Utils.fromBase58Check(address).data as number[], [getNetworkConfig(network).addressPrefix]);

export const isValidAddress = (address: string, chain: Chain): boolean => {
  try {
    const { data, prefix } = Utils.fromBase58Check(address);
    return data.length === 20 && prefix[0] === getChainConfig(chain).addressPrefix;
  } catch {
    return false;
  }
};
