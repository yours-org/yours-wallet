// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

import { Utils } from '@bsv/sdk';
import { NetWork } from './types/provider.types';
import { YoursEventName } from '../inject';
import { sendMessage, sendMessageAsync } from '../utils/chromeHelpers';
import {
  CHROME_STORAGE_OBJECT_VERSION,
  DEFAULT_ACCOUNT,
  DEFAULT_STORAGE_REMOTE_URL,
  FEE_PER_KB,
  HOSTED_YOURS_IMAGE,
  INACTIVITY_LIMIT,
  MAINNET_ADDRESS_PREFIX,
} from '../utils/constants';
import { decrypt, deriveKey, encrypt } from '../utils/crypto';
import { Keys } from '../utils/keys';
import { deepMerge } from './serviceHelpers';
import { Account, ChromeStorageObject, CurrentAccountObject, DeprecatedStorage } from './types/chromeStorage.types';

export class ChromeStorageService {
  storage: Partial<ChromeStorageObject> | undefined;

  // passKey lives in chrome.storage.session (in-memory only, survives service worker idle,
  // cleared on browser close, not written to disk, not accessible to content scripts).
  private cachedPassKey: string | undefined;

  setPassKey = async (passKey: string): Promise<void> => {
    this.cachedPassKey = passKey;
    await chrome.storage.session.set({ passKey });
  };

  getPassKey = async (): Promise<string | undefined> => {
    if (this.cachedPassKey) return this.cachedPassKey;
    const result = await chrome.storage.session.get('passKey');
    this.cachedPassKey = result.passKey;
    return result.passKey;
  };

  clearPassKey = async (): Promise<void> => {
    this.cachedPassKey = undefined;
    await chrome.storage.session.remove('passKey');
  };

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
            whitelist: whitelist ?? [],
            socialProfile: {
              displayName: socialProfile?.displayName ?? 'Anonymous',
              avatar: socialProfile?.avatar ?? HOSTED_YOURS_IMAGE,
            },
            favoriteTokens: [],
            customFeeRate: FEE_PER_KB,
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
          mneeBalance: {
            amount: 0,
            decimalAmount: 0,
          },
          pubKeys: {
            bsvPubKey: appState.pubKeys.bsvPubKey,
            ordPubKey: appState.pubKeys.ordPubKey,
            identityPubKey: appState.pubKeys.identityPubKey,
          },
          network: network ?? appState.network ?? NetWork.Mainnet,
          storageConfig: { ...DEFAULT_ACCOUNT.storageConfig },
        },
      },
      selectedAccount: appState.addresses.identityAddress,
      accountNumber: 1,
      colorTheme,
      isLocked: appState?.isLocked,
      popupWindowId,
      exchangeRateCache,
      lastActiveTime,
      salt,
      version: CHROME_STORAGE_OBJECT_VERSION,
      deviceId: crypto.randomUUID(),
      showWelcome: true,
    };

    await this.set(newInterface);
    await this.remove([
      'appState',
      'derivationTags',
      'encryptedKeys',
      'socialProfile',
      'network',
      'paymentUtxos',
      'whitelist',
    ]);
    return newInterface;
  };

  private async retrieveKeysFromOldStorage(storage: Partial<DeprecatedStorage>): Promise<Partial<Keys> | undefined> {
    const { encryptedKeys } = storage;
    // passKey is no longer in local storage — read from session (only available if user already unlocked)
    const passKey = this.cachedPassKey;
    try {
      if (!encryptedKeys || !passKey) return;
      const d = await decrypt(encryptedKeys, passKey);
      const keys: Keys = JSON.parse(d);

      const walletAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.walletAddress).data as number[], [
        MAINNET_ADDRESS_PREFIX,
      ]);

      const ordAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.ordAddress).data as number[], [
        MAINNET_ADDRESS_PREFIX,
      ]);

      let identityAddr = '';
      let identityPubKey = '';
      if (keys.identityAddress) {
        identityAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.identityAddress).data as number[], [
          MAINNET_ADDRESS_PREFIX,
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
      console.error('Error in retrieveKeys:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private setOldAppStateIfMissing = async (
    storage: Partial<DeprecatedStorage>,
  ): Promise<Partial<ChromeStorageObject>> => {
    if (!(storage as DeprecatedStorage)?.appState) {
      const keys = await this.retrieveKeysFromOldStorage(storage);
      if (!keys) return storage;
      (storage as DeprecatedStorage).appState = {
        isLocked: true,
        ordinals: [],
        balance: { bsv: 0, satoshis: 0, usdInCents: 0 },
        network: NetWork.Mainnet,
        addresses: {
          bsvAddress: keys.walletAddress || '',
          ordAddress: keys.ordAddress || '',
          identityAddress: keys.identityAddress || '',
        },
        pubKeys: {
          bsvPubKey: keys.walletPubKey || '',
          ordPubKey: keys.ordPubKey || '',
          identityPubKey: keys?.identityPubKey || '',
        },
      };
      await this.set(storage);
      return storage;
    }
    return storage;
  };

  private migrateToV5 = async (): Promise<void> => {
    await this.remove(['hasUpgradedToSPV']);
    await this.set({
      version: 5,
      deviceId: crypto.randomUUID(),
      showWelcome: true,
    });
  };

  /**
   * - No storageConfig yet (pre–per-account config): write the current default.
   * - Local active + default remote already listed: promote remote to active.
   * - Any other setup (custom active, remotes without the default, etc.): leave alone.
   */
  private migrateToV6 = async (): Promise<void> => {
    const accounts = this.storage?.accounts ?? {};
    const updates: Record<string, Account> = {};
    const defaultConfig = { ...DEFAULT_ACCOUNT.storageConfig };

    for (const [id, account] of Object.entries(accounts)) {
      const config = account.storageConfig;
      if (!config) {
        updates[id] = { ...account, storageConfig: defaultConfig };
        continue;
      }
      // Already remote-active (default or custom) — leave alone.
      if (config.activeRemote) continue;
      // Only promote when the default remote is already configured as a backup.
      if (!(config.remotes ?? []).includes(DEFAULT_STORAGE_REMOTE_URL)) continue;

      updates[id] = {
        ...account,
        storageConfig: { ...config, activeRemote: DEFAULT_STORAGE_REMOTE_URL },
      };
    }

    await this.set({
      version: 6,
      ...(Object.keys(updates).length > 0
        ? { accounts: { ...accounts, ...updates } }
        : {}),
    });
  };

  private runMigrations = async (): Promise<void> => {
    const currentVersion = this.storage?.version ?? 0;
    if (currentVersion < 5) {
      await this.migrateToV5();
    }
    if ((this.storage?.version ?? currentVersion) < 6) {
      await this.migrateToV6();
    }
  };

  getAndSetStorage = async (): Promise<Partial<ChromeStorageObject> | undefined> => {
    this.storage = await this.get(null); // fetches all chrome storage by passing null

    // Hydrate passKey from session storage (memory-only, survives service worker idle)
    if (!this.cachedPassKey) {
      await this.getPassKey();
    }

    // If passKey is still in local storage (pre-session-storage upgrade), move it to session and clean up
    const legacyPassKey = (this.storage as Record<string, unknown>)?.passKey as string | undefined;
    if (legacyPassKey) {
      if (!this.cachedPassKey) {
        await this.setPassKey(legacyPassKey);
      }
      await this.remove(['passKey']);
    }

    // Migrate from ancient deprecated format (pre-versioned storage)
    if (!this.storage.version && !this.storage.deviceId) {
      this.storage = await this.setOldAppStateIfMissing(this.storage);
      if (!(this.storage as DeprecatedStorage).appState) return;
      this.storage = await this.mapDeprecatedStorageToNewInterface(this.storage as DeprecatedStorage);
    }

    // Run version-based migrations
    if ((this.storage.version ?? 0) < CHROME_STORAGE_OBJECT_VERSION) {
      await this.runMigrations();
      this.storage = await this.get(null);
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
    if (!this.storage) return FEE_PER_KB;
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) return FEE_PER_KB;
    return accounts[selectedAccount]?.settings?.customFeeRate ?? FEE_PER_KB;
  };

  /** Returns the auto-lock timeout in milliseconds. Defaults to INACTIVITY_LIMIT (10 minutes). Capped at 24 hours. */
  getLockTimeout = (): number => {
    if (!this.storage) return INACTIVITY_LIMIT;
    const { accounts, selectedAccount } = this.storage as ChromeStorageObject;
    if (!accounts || !selectedAccount) return INACTIVITY_LIMIT;
    const minutes = accounts[selectedAccount]?.settings?.lockTimeout;
    if (!minutes || minutes < 1) return INACTIVITY_LIMIT;
    return Math.min(minutes, 1440) * 60 * 1000;
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
    await sendMessageAsync({ action: YoursEventName.SWITCH_ACCOUNT });
  };

  /**
   * Verify a password by deriving the passKey and attempting to decrypt stored keys.
   * On success, stores the passKey in session storage so the wallet can initialize.
   * On failure, passKey remains absent — keys stay inaccessible.
   */
  verifyPassword = async (password: string): Promise<boolean> => {
    const { salt, account, selectedAccount } = this.getCurrentAccountObject();
    if (!salt || !account?.encryptedKeys) return false;
    try {
      const derivedKey = deriveKey(password, salt);
      // Attempt decryption — throws if password is wrong
      const decrypted = await decrypt(account.encryptedKeys, derivedKey);
      JSON.parse(decrypted); // Verify it's valid JSON
      // Password correct — store passKey in session (memory-only, not on disk)
      await this.setPassKey(derivedKey);

      // Upgrade legacy encryption to v2 (AES-256-GCM) if needed
      if (selectedAccount && !account.encryptedKeys.startsWith('v2:')) {
        const reEncrypted = await encrypt(decrypted, derivedKey);
        const key: keyof ChromeStorageObject = 'accounts';
        await this.updateNested(key, { [selectedAccount]: { ...account, encryptedKeys: reEncrypted } });
      }

      return true;
    } catch {
      return false;
    }
  };
}
