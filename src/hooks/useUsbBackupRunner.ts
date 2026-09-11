import { useEffect, useState } from 'react';
import { YoursEventName } from '../inject';
import { requestUsbBackup, runUsbBackup, usbBackupEnabled } from '../services/usbBackup';
import type { UsbSecurity } from '../services/types/chromeStorage.types';
import { useServiceContext } from './useServiceContext';
import type { SyncStatusMessage } from './useSyncTracker';

/** Periodic catch-up while the popup stays open. */
const USB_BACKUP_INTERVAL_MS = 60_000;

/**
 * Drives the USB backup sync loop (OPL-4685) from the unlocked popup. Mount
 * once, inside the USB gate, so a registered key is known to be readable.
 * Runs on mount, after every background sync completes, and every minute.
 * Does nothing while the feature is off.
 */
export const useUsbBackupRunner = () => {
  const { chromeStorageService } = useServiceContext();
  const [enabled, setEnabled] = useState(() => usbBackupEnabled(chromeStorageService.getUsbSecurity()));

  // Settings can flip the feature while the popup is open; follow storage so
  // the loop starts or stops without a reopen.
  useEffect(() => {
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !('usbSecurity' in changes)) return;
      setEnabled(usbBackupEnabled(changes.usbSecurity.newValue as UsbSecurity | undefined));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void runUsbBackup(chromeStorageService);

    const onMessage = (message: SyncStatusMessage) => {
      if (message?.action !== YoursEventName.SYNC_STATUS_UPDATE) return;
      if (message.data?.status === 'complete') requestUsbBackup(chromeStorageService);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    const timer = window.setInterval(() => void runUsbBackup(chromeStorageService), USB_BACKUP_INTERVAL_MS);

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      window.clearInterval(timer);
    };
  }, [enabled, chromeStorageService]);
};
