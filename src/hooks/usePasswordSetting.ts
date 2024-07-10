import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';

export const usePasswordSetting = () => {
  const [isPasswordRequired, setIsPasswordRequired] = useState(true);

  const retrieveUserPasswordSetting = async (): Promise<boolean> => {
    const res = await storage.get(['isPasswordRequired']);
    const isRequired =
      res.isPasswordRequired === 'true' ||
      res.isPasswordRequired === true ||
      res.isPasswordRequired === undefined ||
      res.isPasswordRequired === null;
    setIsPasswordRequired(isRequired);
    return isRequired;
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
