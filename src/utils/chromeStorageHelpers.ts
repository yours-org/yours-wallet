import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';

export const saveAccountDataToChromeStorage = async (
  chromeStorageService: ChromeStorageService,
  enteredAccountName: string,
  enteredAccountIcon: string,
) => {
  const { account } = chromeStorageService.getCurrentAccountObject();

  if (!account) return;

  const key: keyof ChromeStorageObject = 'accounts';
  const update: Partial<ChromeStorageObject['accounts']> = {
    [account?.addresses.identityAddress]: {
      ...account,
      name: enteredAccountName || account.name,
      icon: enteredAccountIcon || HOSTED_YOURS_IMAGE,
    },
  };
  await chromeStorageService.updateNested(key, update);
};
