import { useEffect, useState } from 'react';
import { SocialProfile } from 'yours-wallet-provider';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';
import { storage } from '../utils/storage';

export const useSocialProfile = () => {
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({
    displayName: 'Anon Panda',
    avatar: HOSTED_YOURS_IMAGE,
  });

  useEffect(() => {
    const getSocialProfile = (): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        storage.get(['socialProfile'], async (result) => {
          try {
            if (result?.socialProfile) {
              setSocialProfile(result.socialProfile);
            }
            resolve(result.socialProfile);
          } catch (error) {
            reject(error);
          }
        });
      });
    };

    getSocialProfile();
  }, []);

  const storeSocialProfile = (profile: SocialProfile) => {
    storage.set({
      socialProfile: profile,
    });
    setSocialProfile(profile);
  };

  return {
    socialProfile,
    storeSocialProfile,
  };
};
