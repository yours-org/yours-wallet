import JSZip from 'jszip';
import { SPVStore, Txo } from 'spv-store';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
import { sleep } from './sleep';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

export const restoreMasterFromZip = async (
  oneSatSpv: SPVStore,
  chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  file: File,
) => {
  const zip = new JSZip();

  const readChromeStorage = async (zip: JSZip) => {
    progress({ message: 'Reading chrome storage...' });
    await sleep(1000);
    const chromeObjectFile = zip.file('chromeStorage.json');
    if (chromeObjectFile) {
      const chromeObjectData = await chromeObjectFile.async('string');
      const chromeObject = JSON.parse(chromeObjectData);
      return chromeObject as ChromeStorageObject;
    } else {
      throw new Error('Chrome storage data not found in zip.');
    }
  };

  const restoreTxns = async (zip: JSZip) => {
    progress({ message: 'Restoring transactions data...' });
    await sleep(1000);
    const txnFiles = zip.file(/^txns-.*.bin$/);
    if (txnFiles.length > 0) {
      let count = 0;
      const endValue = txnFiles.length;

      for (const txnFile of txnFiles) {
        const txnData = await txnFile.async('uint8array');
        await oneSatSpv.restoreTxns(Array.from(txnData));
        progress({
          message: `Restored ${count + 1} of ${endValue} txn pages...`,
          value: count,
          endValue,
        });
        count++;
      }

      progress({ message: 'Txns restored successfully!' });
      await sleep(1000);
    } else {
      progress({ message: 'No transactions found in backup.' });
    }
  };

  const restoreTxos = async (zip: JSZip, accounts: Account[]) => {
    progress({ message: 'Restoring transaction outputs...' });
    await sleep(1000);

    for (const account of accounts) {
      const txoFiles = zip.file(new RegExp(`txos-${account.addresses.identityAddress}-.*.json`));
      if (txoFiles.length > 0) {
        let count = 0;

        for (const txoFile of txoFiles) {
          const txoData = await txoFile.async('string');
          const txos: Txo[] = JSON.parse(txoData);
          await oneSatSpv.restoreTxos(txos);
          progress({
            message: `Restored ${count + 1} of ${txoFiles.length} txo pages for ${account.addresses.identityAddress}...`,
            value: count,
            endValue: txoFiles.length,
          });
          count++;
        }
      }
    }

    progress({ message: 'Txos restored successfully!' });
    await sleep(1000);
  };

  try {
    const zipContent = await zip.loadAsync(file);
    const chromeObject = await readChromeStorage(zipContent);
    const accounts = Object.values(chromeObject.accounts);

    await restoreTxos(zipContent, accounts);
    await restoreTxns(zipContent);
    await chromeStorageService.update(chromeObject);

    progress({ message: 'Accounts restored successfully!' });
    await sleep(1000);
    progress({ message: 'Master restore complete!' });
    await sleep(1000);
    await chromeStorageService.switchAccount(chromeObject.selectedAccount);
  } catch (error) {
    console.error('Failed to restore zip file', error);
    progress({ message: 'Failed to restore backup, see console for details.' });
  }
};
