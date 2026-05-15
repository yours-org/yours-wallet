import { unzip, type Unzipped } from 'fflate';
import { ChromeStorageService } from '../services/ChromeStorage.service';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

/** Async unzip using Web Workers (available in popup, not in service worker). */
function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

/** Encode Uint8Array to base64 for chrome message passing. */
function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Restore from a master backup ZIP.
 *
 * Decompression happens here in the popup (where Web Workers are available).
 * Only the extracted data needed for restore is sent to the background —
 * legacy backups with hundreds of MB of block data never touch the service worker.
 */
export const restoreMasterFromZip = async (
  _chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  file: File,
  password: string,
) => {
  progress({ message: 'Reading backup file...' });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const zipData = new Uint8Array(arrayBuffer);

    progress({ message: 'Decompressing backup...' });
    const unzipped = await unzipAsync(zipData);

    const chromeStorageRaw = unzipped['chromeStorage.json'];
    if (!chromeStorageRaw) {
      throw new Error('Invalid backup file: missing chromeStorage.json');
    }

    const manifestRaw = unzipped['manifest.json'];
    const isLegacy = !manifestRaw;

    if (isLegacy) {
      // Legacy backup — only chromeStorage.json matters
      progress({ message: 'Restoring account keys...' });

      const response = await chrome.runtime.sendMessage({
        action: 'MASTER_RESTORE',
        legacy: true,
        chromeStorageData: toBase64(chromeStorageRaw),
        password,
      });

      if (!response.success) {
        throw new Error(response.error || 'Restore failed');
      }
    } else {
      // v1/v2 backup — send manifest, chromeStorage, settings, and chunks
      const settingsRaw = unzipped['settings.bin'];
      if (!settingsRaw) {
        throw new Error('Invalid backup file: missing settings.bin');
      }

      // Extract only chunk files
      const chunks: Record<string, string> = {};
      for (const key of Object.keys(unzipped)) {
        if (key.includes('chunk-') && key.endsWith('.bin')) {
          chunks[key] = toBase64(unzipped[key]);
        }
      }

      progress({ message: 'Verifying password and restoring...' });

      const response = await chrome.runtime.sendMessage({
        action: 'MASTER_RESTORE',
        legacy: false,
        manifestData: toBase64(manifestRaw),
        chromeStorageData: toBase64(chromeStorageRaw),
        settingsData: toBase64(settingsRaw),
        chunksData: chunks,
        password,
      });

      if (!response.success) {
        throw new Error(response.error || 'Restore failed');
      }
    }

    progress({ message: 'Restore complete!' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    progress({ message: `Restore failed: ${message}` });
    throw error;
  }
};
