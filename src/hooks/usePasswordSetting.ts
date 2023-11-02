import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';

export const usePasswordSetting = () => {
  const [isPasswordRequired, setIsPasswordRequired] = useState(true);

  const retrieveUserPasswordSetting = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      storage.get(['isPasswordRequired'], async ({ isPasswordRequired }) => {
        try {
          const isRequired =
            isPasswordRequired === 'true' || isPasswordRequired === undefined || isPasswordRequired === null;
          setIsPasswordRequired(isRequired);
          resolve(isRequired);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  useEffect(() => {
    retrieveUserPasswordSetting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isPasswordRequired,
    setIsPasswordRequired,
  };
};
