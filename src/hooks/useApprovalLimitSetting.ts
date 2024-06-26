import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';

export const useNoApprovalLimitSetting = () => {
  const [noApprovalLimit, setNoApprovalLimit] = useState<number | undefined>();

  const retrieveLimit = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      storage.get(['noApprovalLimit'], async (res) => {
        try {
          const limit = res.noApprovalLimit ?? 0;
          setNoApprovalLimit(limit);
          resolve(res.noApprovalLimit);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  useEffect(() => {
    retrieveLimit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    noApprovalLimit,
    setNoApprovalLimit,
  };
};
