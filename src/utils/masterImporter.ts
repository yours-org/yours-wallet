// TODO: Re-implement master restore using OneSatWallet storage APIs
// import JSZip from 'jszip';
// import { OneSatWebSPV } from 'spv-store';
import { ChromeStorageService } from '../services/ChromeStorage.service';
// import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
// import { sleep } from './sleep';
// import { getIndexers, getOwners } from '../initSPVStore';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

// TODO: Re-implement master restore using OneSatWallet storage APIs
// The restore functionality needs to be rewritten to use the new wallet-toolbox
// storage provider's import capabilities once they are available.
export const restoreMasterFromZip = async (
  _chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  _file: File,
) => {
  progress({ message: 'Master restore is temporarily unavailable during wallet migration.' });
  throw new Error('Master restore is temporarily unavailable. Please check back after the next update.');
};
