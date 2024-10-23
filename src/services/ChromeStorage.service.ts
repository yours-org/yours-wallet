// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

import { Utils } from '@bsv/sdk';
import { NetWork } from 'yours-wallet-provider';
import { YoursEventName } from '../inject';
import { sendMessage } from '../utils/chromeHelpers';
import {
  CHROME_STORAGE_OBJECT_VERSION,
  HOSTED_YOURS_IMAGE,
  MAINNET_ADDRESS_PREFIX,
  TESTNET_ADDRESS_PREFIX,
} from '../utils/constants';
import { decrypt } from '../utils/crypto';
import { Keys } from '../utils/keys';
import { deepMerge } from './serviceHelpers';
import { Account, ChromeStorageObject, CurrentAccountObject, DeprecatedStorage } from './types/chromeStorage.types';

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
      chrome.storage.local.get(keyOrKeys, (result: Partial<ChromeStorageObject>) => {
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
            isPasswordRequired: appState.isPasswordRequired,
            socialProfile: {
              displayName: socialProfile?.displayName ?? 'Anonymous',
              avatar: socialProfile?.avatar ?? HOSTED_YOURS_IMAGE,
            },
            favoriteTokens: [],
            customFeeRate: 10,
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
          pubKeys: {
            bsvPubKey: appState.pubKeys.bsvPubKey,
            ordPubKey: appState.pubKeys.ordPubKey,
            identityPubKey: appState.pubKeys.identityPubKey,
          },
          network: network ?? appState.network ?? NetWork.Mainnet,
        },
      },
      selectedAccount: appState.addresses.identityAddress,
      accountNumber: 1,
      colorTheme,
      isLocked: appState?.isLocked,
      popupWindowId,
      exchangeRateCache,
      lastActiveTime,
      passKey,
      salt,
      version: CHROME_STORAGE_OBJECT_VERSION, // Version 1 is the first version of the new storage object and should be updated if it ever changes
      hasUpgradedToSPV: false,
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

  private retrieveKeysFromOldStorage(storage: Partial<DeprecatedStorage>): Partial<Keys> | undefined {
    const { encryptedKeys, passKey, network } = storage;
    try {
      if (!encryptedKeys || !passKey) return;
      const d = decrypt(encryptedKeys, passKey);
      const keys: Keys = JSON.parse(d);

      const walletAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.walletAddress).data as number[], [
        network === NetWork.Mainnet || !network ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
      ]);

      const ordAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.ordAddress).data as number[], [
        network === NetWork.Mainnet || !network ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
      ]);

      let identityAddr = '';
      let identityPubKey = '';
      if (keys.identityAddress) {
        identityAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.identityAddress).data as number[], [
          network === NetWork.Mainnet || !network ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
        ]);

        identityPubKey = keys.identityPubKey;
      }

      return {
        ordAddress: ordAddr,
        walletAddress: walletAddr,
        walletPubKey: keys.walletPubKey,
        ordPubKey: keys.ordPubKey,
        identityAddress: identityAddr,
        identityPubKey,
      };
    } catch (error) {
      console.log('Error in retrieveKeys:', error);
    }
  }

  private setOldAppStateIfMissing = async (
    storage: Partial<DeprecatedStorage>,
  ): Promise<Partial<ChromeStorageObject>> => {
    console.log(storage);
    if (!(storage as DeprecatedStorage)?.appState) {
      const keys = this.retrieveKeysFromOldStorage(storage);
      console.log(keys);
      (storage as DeprecatedStorage).appState = {
        isLocked: true,
        ordinals: [],
        balance: { bsv: 0, satoshis: 0, usdInCents: 0 },
        network: NetWork.Mainnet,
        isPasswordRequired: true,
        addresses: {
          bsvAddress: keys?.walletAddress || '',
          ordAddress: keys?.ordAddress || '',
          identityAddress: keys?.identityAddress || '',
        },
        pubKeys: {
          bsvPubKey: keys?.walletPubKey || '',
          ordPubKey: keys?.ordPubKey || '',
          identityPubKey: keys?.identityPubKey || '',
        },
      };
      await this.set(storage);
      return storage;
    }
    return storage;
  };

  getAndSetStorage = async (): Promise<Partial<ChromeStorageObject> | undefined> => {
    this.storage = await this.get(null); // fetches all chrome storage by passing null
    if (!this.storage.version && !this.storage.hasUpgradedToSPV) {
      this.storage = await this.setOldAppStateIfMissing(this.storage);
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

  removeNested = async <K extends keyof ChromeStorageObject>(key: K, nestedKey: string): Promise<void> => {
    try {
      const result = await this.get([key]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingObject = (result[key] ?? {}) as Record<string, any>;
      delete existingObject[nestedKey];
      const data: Partial<ChromeStorageObject> = { [key]: existingObject as ChromeStorageObject[K] };
      await this.set(data);
    } catch (error) {
      throw new Error(`Failed to remove nested object value: ${error}`);
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
      selectedAccount,
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
    const { network } = account;
    return network ?? NetWork.Mainnet;
  };

  getCustomFeeRate = (): number => {
    if (!this.storage) return 10;
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) return 10;
    return accounts[selectedAccount]?.settings?.customFeeRate ?? 10;
  };

  isPasswordRequired = (): boolean => {
    if (this.storage === null || this.storage === undefined) {
      return true;
    }
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) {
      return true;
    }
    const account = accounts[selectedAccount];
    if (account.settings.isPasswordRequired === undefined) {
      return true;
    }
    return account.settings.isPasswordRequired;
  };

  getAllAccounts = (): Account[] => {
    if (this.storage === null || this.storage === undefined) {
      return [];
    }
    const { accounts } = this.storage as ChromeStorageObject;
    if (!accounts) return [];
    const accountsArray = Object.entries(accounts).map(([address, account]) => ({
      ...account,
      address,
    }));

    return accountsArray;
  };

  switchAccount = async (identityAddress: string): Promise<void> => {
    await this.update({ selectedAccount: identityAddress });
    sendMessage({ action: YoursEventName.SWITCH_ACCOUNT });
  };
}
