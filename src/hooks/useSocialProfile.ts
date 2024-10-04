import { useEffect, useState } from 'react';
import { SocialProfile } from 'yours-wallet-provider';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';

export const useSocialProfile = (chromeStorageService: ChromeStorageService) => {
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({
    displayName: 'Anonymous',
    avatar: HOSTED_YOURS_IMAGE,
  });

  useEffect(() => {
    const getSocialProfile = async (): Promise<SocialProfile> => {
      const { account } = chromeStorageService.getCurrentAccountObject();
      const profile = account?.settings?.socialProfile;
      if (!profile) return socialProfile;
      setSocialProfile(profile);
      return profile;
    };

    getSocialProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeSocialProfile = async (profile: SocialProfile) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account found');
    const accountSettings = account.settings;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [account.addresses.identityAddress]: {
        ...account,
        settings: {
          ...accountSettings,
          socialProfile: profile,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
    setSocialProfile(profile);
  };

  return {
    socialProfile,
    storeSocialProfile,
  };
};
