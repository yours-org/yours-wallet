export const sendMessage = (message: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(response);
    });
  });
};

export const removeWindow = (windowId: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.windows.remove(windowId, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
};

export const launchPopUp = (): Promise<number | undefined> => {
  return new Promise((resolve) => {
    chrome.windows.create(
      {
        url: chrome.runtime.getURL('index.html'),
        type: 'popup',
        width: 360,
        height: 567,
      },
      (window) => {
        const popupWindowId = window?.id;
        if (popupWindowId) {
          chrome.storage.local.set({ popupWindowId }, () => {
            resolve(popupWindowId);
          });
        } else {
          resolve(undefined);
        }
      },
    );
  });
};
