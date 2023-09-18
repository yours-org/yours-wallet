interface Storage {
  set: (obj: any, callback?: () => void) => void;
  get: (key: string | string[], callback: (result: any) => void) => void;
}

const mockStorage: Storage = {
  set: (obj, callback) => {
    Object.keys(obj).forEach((key) => {
      localStorage.setItem(key, obj[key]);
    });
    if (callback) callback();
  },
  get: (keyOrKeys, callback) => {
    // Define an indexable type for the result object
    const result: { [key: string]: string | null } = {};

    if (typeof keyOrKeys === "string") {
      const value = localStorage.getItem(keyOrKeys);
      result[keyOrKeys] = value;
      callback(result);
    } else if (Array.isArray(keyOrKeys)) {
      keyOrKeys.forEach((key) => {
        result[key] = localStorage.getItem(key);
      });
      callback(result);
    }
  },
};

// Checking if we're in a Chrome environment
const isChromeEnv =
  typeof chrome !== "undefined" && typeof chrome.storage !== "undefined";

// Use chrome.storage.local if in Chrome environment, otherwise use mockStorage
export const storage: Storage = isChromeEnv
  ? chrome.storage.local
  : mockStorage;
