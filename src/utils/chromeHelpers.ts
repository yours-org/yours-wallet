/* eslint-disable @typescript-eslint/no-explicit-any */
export const sendMessage = (message: any) => {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    console.log(response);
  });
};

export const removeWindow = (windowId: number) => {
  chrome.windows.remove(windowId, () => {
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
  });
};

export const launchPopUp = () => {
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
        chrome.storage.local.set({
          popupWindowId,
        });
      }
    },
  );
};
