import { ChromeStorageService } from '../services/ChromeStorage.service';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

// TODO: Re-implement master backup using OneSatWallet storage APIs
// The backup functionality needs to be rewritten to use the new wallet-toolbox
// storage provider's export capabilities once they are available.
export const streamDataToZip = async (_chromeStorageService: ChromeStorageService, progress: MasterBackupProgress) => {
  progress({ message: 'Master backup is temporarily unavailable during wallet migration.' });
  throw new Error('Master backup is temporarily unavailable. Please check back after the next update.');
};
