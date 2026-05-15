import { ChromeStorageService } from '../services/ChromeStorage.service';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
  /** Name of the account currently being backed up. */
  accountName?: string;
  /** 0-based index of the account being backed up. */
  accountIndex?: number;
  /** Total number of accounts in the backup. */
  totalAccounts?: number;
  stage?: 'preparing' | 'exporting' | 'complete' | 'error';
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

/**
 * Initiates master backup by sending a message to the background script.
 * Listens for MASTER_BACKUP_PROGRESS broadcasts to stream per-account
 * progress back to the caller in real time.
 */
export const streamDataToZip = async (_chromeStorageService: ChromeStorageService, progress: MasterBackupProgress) => {
  progress({ message: 'Starting backup...', stage: 'preparing' });

  // Listen for progress broadcasts from the background script
  const progressListener = (message: { action?: string; data?: MasterBackupProgressEvent }) => {
    if (message.action === 'MASTER_BACKUP_PROGRESS' && message.data) {
      const d = message.data;
      progress({
        message: d.message,
        accountName: d.accountName,
        accountIndex: d.accountIndex,
        totalAccounts: d.totalAccounts,
        stage: d.stage,
        value: d.accountIndex !== undefined ? d.accountIndex + 1 : undefined,
        endValue: d.totalAccounts,
      });
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  try {
    const response = await chrome.runtime.sendMessage({ action: 'MASTER_BACKUP' });

    chrome.runtime.onMessage.removeListener(progressListener);

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

    progress({ message: 'Backup complete!', stage: 'complete' });
  } catch (error) {
    chrome.runtime.onMessage.removeListener(progressListener);
    const message = error instanceof Error ? error.message : 'Unknown error';
    progress({ message: `Backup failed: ${message}`, stage: 'error' });
    throw error;
  }
};
