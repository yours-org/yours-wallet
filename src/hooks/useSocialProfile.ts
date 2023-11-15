import { useEffect, useState } from 'react';
import { HOSTED_PANDA_IMAGE } from '../utils/constants';
import { storage } from '../utils/storage';

export type SocialProfile = {
  displayName: string;
  avatar: string;
};

export const useSocialProfile = () => {
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({
    displayName: 'Anon Panda',
    avatar: HOSTED_PANDA_IMAGE,
  });

  useEffect(() => {
    const getSocialProfile = (): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        storage.get(['socialProfile'], async (result) => {
          try {
            if (result?.socialProfile && !window.location.href.includes('localhost')) {
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
