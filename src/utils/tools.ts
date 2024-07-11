import { NetWork } from 'yours-wallet-provider';
import { Utils } from '@bsv/sdk';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const isAddressOnRightNetwork = (network: NetWork, address: string) => {
  switch (network) {
    case NetWork.Mainnet:
      return address.startsWith('1');
    case NetWork.Testnet:
      return !address.startsWith('1');
  }
};

export const convertAddressToTestnet = (address: string) => {
  return Utils.toBase58Check(Utils.fromBase58Check(address).data as number[], [0x6f]);
};

export const convertAddressToMainnet = (address: string) => {
  return Utils.toBase58Check(Utils.fromBase58Check(address).data as number[], [0x00]);
};
