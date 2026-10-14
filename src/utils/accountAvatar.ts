import type { OneSatContext } from '@1sat/actions';
import { resolveImageUrl } from '../hooks/useIdentity';
import type { Account } from '../services/types/chromeStorage.types';
import { HOSTED_YOURS_IMAGE } from './constants';

/**
 * The image to show for an account. The on-chain BAP identity image (cached
 * per account by useIdentity) wins; the legacy per-account icon is only a
 * fallback for accounts that set one before identity images existed.
 */
export const getAccountAvatar = (
  account: Pick<Account, 'icon' | 'settings'> | undefined,
  apiContext?: OneSatContext,
): string => {
  const bapImage = account?.settings?.socialProfile?.avatar;
  if (bapImage && bapImage !== HOSTED_YOURS_IMAGE) {
    return apiContext?.services ? resolveImageUrl(bapImage, apiContext) : bapImage;
  }
  return account?.icon || HOSTED_YOURS_IMAGE;
};
