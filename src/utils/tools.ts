import { NetWork } from 'yours-wallet-provider';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const isAddressOnRightNetwork = (network: NetWork, address: string) => {
  switch (network) {
    case 'mainnet':
      return address.startsWith('1');
    case 'testnet':
      return !address.startsWith('1');
  }
};
