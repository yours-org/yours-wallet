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
