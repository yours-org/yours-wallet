import { HOSTED_YOURS_IMAGE } from './constants';

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

export const sendTransactionNotification = (newTxCount: number) => {
  // Create the Chrome notification
  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: HOSTED_YOURS_IMAGE,
      title: 'New Transactions',
      message: `Your SPV wallet has received ${newTxCount} new transaction${newTxCount > 1 ? 's' : ''}!`,
      priority: 2,
    },
    (notificationId: string) => {
      if (chrome.runtime.lastError) {
        console.error('Notification error:', chrome.runtime.lastError.message || chrome.runtime.lastError);
      } else {
        console.log('Notification sent:', notificationId);
      }
    },
  );
};
