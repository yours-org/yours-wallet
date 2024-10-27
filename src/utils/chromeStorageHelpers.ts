import { ChromeStorageObject } from '../services/types/chromeStorage.types';

export const saveAccountDataToChromeStorage = async (
  chromeStorageService: any, // Accept as an argument
  enteredAccountName: string,
  enteredAccountIcon: string,
) => {
  // Retrieve the current account from Chrome storage
  const { account } = chromeStorageService.getCurrentAccountObject();

  // Ensure the account exists
  if (!account) return;

  // Define the key for storage
  const key: keyof ChromeStorageObject = 'accounts';

  // Prepare the update for the account's name and icon
  const update: Partial<ChromeStorageObject['accounts']> = {
    [account?.addresses.identityAddress]: {
      ...account,
      name: enteredAccountName,
      icon: enteredAccountIcon,
    },
  };

  // Update the nested storage
  await chromeStorageService.updateNested(key, update);
};
