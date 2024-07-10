/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChromeStorageObject } from '../contexts/types/global.types';

interface Storage {
  set: (obj: any) => Promise<void>;
  get: (key: string | string[] | null) => Promise<any>;
  remove: (key: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
  onChanged: {
    addListener: (callback: (changes: any, namespace: string) => void) => void;
  };
}

const mockStorage: Storage = {
  set: async (obj) => {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'object') {
        localStorage.setItem(key, JSON.stringify(obj[key]));
      } else {
        localStorage.setItem(key, obj[key]);
      }
    });
  },
  get: async (keyOrKeys) => {
    return new Promise((resolve) => {
      const result: { [key: string]: string | null } = {};

      if (keyOrKeys === null) {
        // Retrieve all items from localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            try {
              result[key] = value ? JSON.parse(value) : value;
            } catch {
              result[key] = value;
            }
          }
        }
        resolve(result);
      } else if (typeof keyOrKeys === 'string') {
        const value = localStorage.getItem(keyOrKeys);
        try {
          result[keyOrKeys] = value ? JSON.parse(value) : value;
        } catch {
          result[keyOrKeys] = value;
        }
        resolve(result);
      } else if (Array.isArray(keyOrKeys)) {
        keyOrKeys.forEach((key) => {
          const value = localStorage.getItem(key);
          try {
            result[key] = value ? JSON.parse(value) : value;
          } catch {
            result[key] = value;
          }
        });
        resolve(result);
      }
    });
  },
  remove: async (keyOrKeys) => {
    if (typeof keyOrKeys === 'string') {
      localStorage.removeItem(keyOrKeys);
    } else if (Array.isArray(keyOrKeys)) {
      keyOrKeys.forEach((key) => {
        localStorage.removeItem(key);
      });
    }
  },
  clear: async () => {
    await new Promise<void>((resolve) => {
      localStorage.clear();
      resolve();
    });
  },
  onChanged: {
    addListener: (callback) => {
      window.addEventListener('storage', (event) => {
        const changes = { [event.key as string]: { newValue: event.newValue, oldValue: event.oldValue } };
        callback(changes, 'local');
      });
    },
  },
};

// Wrapper to adapt chrome.storage.onChanged to match our custom Storage interface
const chromeStorage: Storage = {
  set: (obj) =>
    new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    }),
  get: (keyOrKeys) =>
    new Promise<Partial<ChromeStorageObject>>((resolve, reject) => {
      chrome.storage.local.get(keyOrKeys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    }),
  remove: (keyOrKeys) =>
    new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(keyOrKeys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    }),
  clear: () =>
    new Promise<void>((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    }),
  onChanged: {
    addListener: (callback) => {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        const adaptedChanges = Object.keys(changes).reduce(
          (acc, key) => {
            acc[key] = { newValue: changes[key].newValue, oldValue: changes[key].oldValue };
            return acc;
          },
          {} as Record<string, { newValue: any; oldValue: any }>,
        );
        callback(adaptedChanges, namespace);
      });
    },
  },
};

const isChromeEnv = typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined';

// Use chromeStorage if in Chrome environment, otherwise use mockStorage
export const storage: Storage = isChromeEnv ? chromeStorage : mockStorage;
