import { useEffect, useState } from 'react';
import { NetWork, NetWorkStorage } from '../utils/network';
import { storage } from '../utils/storage';

export const useNetwork = () => {
  const [network, setNetwork] = useState(NetWork.Mainnet);

  const retrieveNetwork = async (): Promise<NetWork> => {
    const result: NetWorkStorage = await storage.get(['network']);
    if (!result.network) {
      setNetwork(NetWork.Mainnet);
      return NetWork.Mainnet;
    }

    setNetwork(result.network);
    return result.network;
  };

  useEffect(() => {
    retrieveNetwork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAddressOnRightNetwork = (address: string) => {
    switch (network) {
      case NetWork.Mainnet:
        return address.startsWith('1');
      case NetWork.Testnet:
        return !address.startsWith('1');
    }
  };

  return {
    network,
    setNetwork,
    isAddressOnRightNetwork,
  };
};
