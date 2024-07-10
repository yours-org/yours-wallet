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
    const getSocialProfile = async (): Promise<SocialProfile> => {
      const res = await storage.get(['socialProfile']);
      if (res?.socialProfile) {
        setSocialProfile(res.socialProfile);
      }
      return res.socialProfile;
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
