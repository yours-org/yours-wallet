import { useEffect, useState } from 'react';
import { SocialProfile } from 'yours-wallet-provider';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';

export const useSocialProfile = (chromeStorageService: ChromeStorageService) => {
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({
    displayName: 'Anon Panda',
    avatar: HOSTED_YOURS_IMAGE,
  });

  useEffect(() => {
    const getSocialProfile = async (): Promise<SocialProfile> => {
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) return socialProfile;
      if (account.socialProfile) {
        setSocialProfile(account.socialProfile);
      }
      return account.socialProfile;
    };

    getSocialProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeSocialProfile = async (profile: SocialProfile) => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account found');
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [account.addresses.identityAddress]: {
        ...account,
        socialProfile: profile,
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
