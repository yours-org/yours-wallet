import { useEffect, useState } from "react";
import { storage } from "../utils/storage";

export type NetWorkStorage = {
  network: NetWork;
};

export const enum NetWork {
  Mainnet = "mainnet",
  Testnet = "testnet",
}

export const useNetwork = () => {
  const [network, setNetwork] = useState(NetWork.Mainnet);

  const retrieveNetwork = (): Promise<NetWork> => {
    return new Promise((resolve, reject) => {
      storage.get(
        ["network"],
        async (result: NetWorkStorage) => {
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
        }
      );
    });
  };

  const updateNetwork = (n: NetWork): void => {
    storage.set({
      network: n
    });
    setNetwork(n)
  };


  useEffect(() => {
    retrieveNetwork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    retrieveNetwork,
    network,
    updateNetwork
  };
};
