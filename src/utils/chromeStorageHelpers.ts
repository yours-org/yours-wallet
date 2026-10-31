import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { ChromeStorageService } from '../services/ChromeStorage.service';

export const saveAccountDataToChromeStorage = async (
  chromeStorageService: ChromeStorageService,
  enteredAccountName: string,
) => {
  const { account } = chromeStorageService.getCurrentAccountObject();

  if (!account) return;

  const key: keyof ChromeStorageObject = 'accounts';
  const update: Partial<ChromeStorageObject['accounts']> = {
    [account?.addresses.identityAddress]: {
      ...account,
      name: enteredAccountName || account.name,
    },
  };
  await chromeStorageService.updateNested(key, update);
};
