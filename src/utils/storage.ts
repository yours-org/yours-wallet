interface Storage {
  set: (obj: any, callback?: () => void) => void;
  get: (key: string | string[], callback: (result: any) => void) => void;
  remove: (key: string | string[], callback?: () => void) => void;
  clear: () => Promise<void>;
}

const mockStorage: Storage = {
  set: (obj, callback) => {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'object') {
        localStorage.setItem(key, JSON.stringify(obj[key]));
      } else {
        localStorage.setItem(key, obj[key]);
      }
    });
    if (callback) callback();
  },
  get: (keyOrKeys, callback) => {
    // Define an indexable type for the result object
    const result: { [key: string]: string | null } = {};

    if (typeof keyOrKeys === 'string') {
      const value = localStorage.getItem(keyOrKeys);
      if (typeof value === 'string') {
        if ((value.startsWith('"') && value.startsWith('"')) || (value.startsWith('{') && value.startsWith('}'))) {
          result[keyOrKeys] = JSON.parse(value);
        } else {
          result[keyOrKeys] = value;
        }
      } else {
        result[keyOrKeys] = value;
      }

      callback(result);
    } else if (Array.isArray(keyOrKeys)) {
      keyOrKeys.forEach((key) => {
        const value = localStorage.getItem(key);
        if (typeof value === 'string') {
          if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
            result[key] = JSON.parse(value);
          } else {
            result[key] = value;
          }
        } else {
          result[key] = value;
        }
      });
      callback(result);
    }
  },
  remove: (keyOrKeys, callback) => {
    if (typeof keyOrKeys === 'string') {
      localStorage.removeItem(keyOrKeys);
    } else if (Array.isArray(keyOrKeys)) {
      keyOrKeys.forEach((key) => {
        localStorage.removeItem(key);
      });
    }
    if (callback) callback();
  },
  clear: async () => {
    // Made the clear method asynchronous
    await new Promise<void>((resolve) => {
      localStorage.clear();
      resolve();
    });
  },
};

// Checking if we're in a Chrome environment
const isChromeEnv = typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined';

// Use chrome.storage.local if in Chrome environment, otherwise use mockStorage
export const storage: Storage = isChromeEnv ? chrome.storage.local : mockStorage;
