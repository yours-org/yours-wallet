import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { NetWork, NetWorkStorage } from '../utils/network';

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

  return {
    network,
    setNetwork,
  };
};
