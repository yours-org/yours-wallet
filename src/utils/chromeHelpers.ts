/* eslint-disable @typescript-eslint/no-explicit-any */
export const sendMessage = (message: any) => {
  try {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.warn(chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error(error);
  }
};

export const removeWindow = (windowId: number) => {
  try {
    chrome.windows.remove(windowId, () => {
      if (chrome.runtime.lastError) {
        console.warn(chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error(error);
  }
};
