import { ChromeStorageService } from '../services/ChromeStorage.service';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

/**
 * Initiates master backup by sending a message to the background script.
 * The background script has access to the wallet storage manager and can
 * perform the actual backup.
 */
export const streamDataToZip = async (
  _chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
) => {
  progress({ message: 'Starting backup...' });

  try {
    const response = await chrome.runtime.sendMessage({ action: 'MASTER_BACKUP' });

    if (!response.success) {
      throw new Error(response.error || 'Backup failed');
    }

    // The background script returns a base64-encoded blob
    const binaryString = atob(response.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yours_wallet_backup_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    progress({ message: 'Backup complete!' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    progress({ message: `Backup failed: ${message}` });
    throw error;
  }
};
