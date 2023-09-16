interface Storage {
  set: (obj: any, callback?: () => void) => void;
  get: (key: string, callback: (result: any) => void) => void;
}

const mockStorage: Storage = {
  set: (obj, callback) => {
    Object.keys(obj).forEach((key) => {
      localStorage.setItem(key, obj[key]);
    });
    if (callback) callback();
  },
  get: (key, callback) => {
    const value = localStorage.getItem(key);
    callback({ [key]: value });
  },
};

// Checking if we're in a Chrome environment
const isChromeEnv =
  typeof chrome !== "undefined" && typeof chrome.storage !== "undefined";

// Use chrome.storage.local if in Chrome environment, otherwise use mockStorage
export const storage: Storage = isChromeEnv
  ? chrome.storage.local
  : mockStorage;
