import { ChromeStorageService } from '../services/ChromeStorage.service';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

/**
 * Initiates master restore by sending a message to the background script.
 * The background script has access to the wallet storage manager and can
 * perform the actual restore.
 */
export const restoreMasterFromZip = async (
  _chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  file: File,
  password: string,
) => {
  progress({ message: 'Reading backup file...' });

  try {
    // Read file as base64 to send to background script
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    progress({ message: 'Verifying password and restoring...' });

    const response = await chrome.runtime.sendMessage({
      action: 'MASTER_RESTORE',
      fileData: base64Data,
      password,
    });

    if (!response.success) {
      throw new Error(response.error || 'Restore failed');
    }

    progress({ message: 'Restore complete!' });

    return response.manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    progress({ message: `Restore failed: ${message}` });
    throw error;
  }
};
