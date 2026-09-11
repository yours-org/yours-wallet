import { useEffect, useRef, useState } from 'react';
import { YoursEventName } from '../inject';
import { requestUsbBackup, runUsbBackup, usbBackupEnabled } from '../services/usbBackup';
import type { UsbSecurity } from '../services/types/chromeStorage.types';
import { useServiceContext } from './useServiceContext';
import type { SyncStatusMessage } from './useSyncTracker';

/** Periodic catch-up while the popup stays open. */
const USB_BACKUP_INTERVAL_MS = 60_000;
/** On open, give the wallet's own address sync this long to announce itself before the first run. */
const INITIAL_SETTLE_MS = 2_500;
/** After a run finishes, ignore wallet-change events for this long: the run already saw them. */
const COOLDOWN_MS = 20_000;

/**
 * Drives the USB backup sync loop (OPL-4685) from the unlocked popup. Mount
 * once, inside the USB gate, so a registered key is known to be readable.
 *
 * Timing is arranged so the user sees ONE sync per real change, not a run on
 * open followed by another the moment the wallet's own address sync ends:
 * - On open, wait briefly. If the address sync announces a start, the first
 *   run waits for its completion; otherwise it runs after the settle delay.
 * - After any run, wallet-change events are ignored for a cooldown window.
 * - A one-minute timer catches anything that slipped through.
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

  const lastRunEnded = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let addressSyncRunning = false;
    let initialDone = false;

    const run = async () => {
      await runUsbBackup(chromeStorageService);
      lastRunEnded.current = Date.now();
    };

    const initialTimer = window.setTimeout(() => {
      // No address sync announced itself: run now. If one did, its completion runs us.
      if (!initialDone && !addressSyncRunning) {
        initialDone = true;
        void run();
      }
    }, INITIAL_SETTLE_MS);

    const onMessage = (message: SyncStatusMessage) => {
      if (message?.action !== YoursEventName.SYNC_STATUS_UPDATE) return;
      const status = message.data?.status;
      if (status === 'start') {
        addressSyncRunning = true;
        return;
      }
      if (status !== 'complete' && status !== 'error') return;
      addressSyncRunning = false;
      if (!initialDone) {
        initialDone = true;
        void run();
        return;
      }
      // A change after the first run: skip if a run just finished (it saw the change).
      if (Date.now() - lastRunEnded.current < COOLDOWN_MS) return;
      requestUsbBackup(chromeStorageService);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    const timer = window.setInterval(() => void run(), USB_BACKUP_INTERVAL_MS);

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [enabled, chromeStorageService]);
};
