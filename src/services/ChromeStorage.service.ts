import { NetWork } from 'yours-wallet-provider';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';
import { deepMerge } from './serviceHelpers';
import { ChromeStorageObject, CurrentAccountObject, DeprecatedStorage } from './types/chromeStorage.types';

export class ChromeStorageService {
  storage: Partial<ChromeStorageObject> | undefined;

  private set = async (obj: Partial<ChromeStorageObject>): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(obj, async () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          await this.getAndSetStorage();
          resolve();
        }
      });
    });
  };

  private get = async (keyOrKeys: string | string[] | null): Promise<Partial<ChromeStorageObject>> => {
    return new Promise<Partial<ChromeStorageObject>>((resolve, reject) => {
      chrome.storage.local.get(keyOrKeys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  };

  remove = async (keyOrKeys: string | string[]): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(keyOrKeys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };

  clear = async (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };

  private mapDeprecatedStorageToNewInterface = async (
    oldStorage: DeprecatedStorage,
  ): Promise<Partial<ChromeStorageObject>> => {
    const {
      appState,
      colorTheme,
      derivationTags,
      encryptedKeys,
      exchangeRateCache,
      lastActiveTime,
      network,
      noApprovalLimit,
      passKey,
      paymentUtxos,
      popupWindowId,
      salt,
      socialProfile,
      whitelist,
    } = oldStorage;

    const newInterface: Partial<ChromeStorageObject> = {
      accounts: {
        [appState.addresses.identityAddress]: {
          name: 'Account 1',
          icon: socialProfile?.avatar ?? HOSTED_YOURS_IMAGE,
          encryptedKeys, // See Keys type
          derivationTags: derivationTags ?? [],
          settings: {
            noApprovalLimit: noApprovalLimit ?? 0,
            whitelist: whitelist ?? [],
            network: network ?? appState.network ?? NetWork.Mainnet,
          },
          addresses: {
            bsvAddress: appState.addresses.bsvAddress,
            ordAddress: appState.addresses.ordAddress,
            identityAddress: appState.addresses.identityAddress,
          },
          balance: {
            bsv: appState.balance?.bsv ?? 0,
            satoshis: appState.balance?.satoshis ?? 0,
            usdInCents: appState.balance?.usdInCents ?? 0,
          },
          isPasswordRequired: appState.isPasswordRequired,
          ordinals: appState?.ordinals ?? [], // TODO: remove
          paymentUtxos: paymentUtxos ?? [], // TODO: remove
          pubKeys: {
            bsvPubKey: appState.pubKeys.bsvPubKey,
            ordPubKey: appState.pubKeys.ordPubKey,
            identityPubKey: appState.pubKeys.identityPubKey,
          },
          socialProfile: {
            displayName: socialProfile?.displayName ?? 'Anon Panda',
            avatar: socialProfile?.avatar ?? HOSTED_YOURS_IMAGE,
          },
        },
      },
      selectedAccount: appState.addresses.identityAddress,
      colorTheme,
      isLocked: appState?.isLocked,
      popupWindowId,
      exchangeRateCache,
      lastActiveTime,
      passKey,
      salt,
      version: 1, // Version 1 is the first version of the new storage object and should be updated if it ever changes
    };

    await this.set(newInterface);
    await this.remove([
      'appState',
      'derivationTags',
      'encryptedKeys',
      'socialProfile',
      'noApprovalLimit',
      'network',
      'paymentUtxos',
      'whitelist',
    ]);
    return newInterface;
  };

  getAndSetStorage = async (): Promise<Partial<ChromeStorageObject> | undefined> => {
    this.storage = await this.get(null); // fetches all chrome storage by passing null
    if ((this.storage as DeprecatedStorage)?.appState?.addresses?.identityAddress && !this.storage.version) {
      this.storage = await this.mapDeprecatedStorageToNewInterface(this.storage as DeprecatedStorage);
    }
    return this.storage;
  };

  updateNested = async <K extends keyof ChromeStorageObject>(
    key: K,
    update: Partial<ChromeStorageObject[K]>,
  ): Promise<void> => {
    try {
      const result = await this.get([key]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingObject = (result[key] ?? {}) as Record<string, any>;
      const mergedObject = deepMerge(existingObject, update);
      const data: Partial<ChromeStorageObject> = { [key]: mergedObject as ChromeStorageObject[K] };
      await this.set(data);
    } catch (error) {
      throw new Error(`Failed to set nested object value: ${error}`);
    }
  };

  update = async (obj: Partial<ChromeStorageObject>): Promise<void> => {
    try {
      const result = await this.get(null); // Get all storage
      const mergedObject = deepMerge(result, obj);
      await this.set(mergedObject);
    } catch (error) {
      throw new Error(`Failed to update storage: ${error}`);
    }
  };

  getCurrentAccountObject = (): Partial<CurrentAccountObject> => {
    if (this.storage === null || this.storage === undefined) {
      throw new Error('Storage is not initialized.');
    }
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts) {
      return this.storage;
    }
    return {
      account: accounts[selectedAccount],
      exchangeRateCache: this.storage.exchangeRateCache,
      isLocked: this.storage.isLocked,
      lastActiveTime: this.storage.lastActiveTime,
      passKey: this.storage.passKey,
      salt: this.storage.salt,
    };
  };

  getNetwork = (): NetWork => {
    if (this.storage === null || this.storage === undefined) {
      throw new Error('Storage is not initialized.');
    }
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) {
      return NetWork.Mainnet;
    }
    const account = accounts[selectedAccount];
    const { settings } = account;
    if (!settings.network) {
      return NetWork.Mainnet;
    }
    return settings.network;
  };

  isPasswordRequired = (): boolean => {
    if (this.storage === null || this.storage === undefined) {
      throw new Error('Storage is not initialized.');
    }
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) {
      throw new Error('No account found!');
    }
    const account = accounts[selectedAccount];
    if (account.isPasswordRequired === undefined) {
      return true;
    }
    return account.isPasswordRequired;
  };
}
