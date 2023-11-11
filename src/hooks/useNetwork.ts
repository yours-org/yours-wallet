import { useEffect, useState } from 'react';
import { NetWork, NetWorkStorage } from '../utils/network';
import { storage } from '../utils/storage';

export const useNetwork = () => {
  const [network, setNetwork] = useState(NetWork.Mainnet);

  const retrieveNetwork = (): Promise<NetWork> => {
    return new Promise((resolve, reject) => {
      storage.get(['network'], async (result: NetWorkStorage) => {
        try {
          if (!result.network) {
            setNetwork(NetWork.Mainnet);
            resolve(NetWork.Mainnet);
            return;
          }

          setNetwork(result.network);
          resolve(result.network);
        } catch (error) {
          reject(error);
        }
      });
    });
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
