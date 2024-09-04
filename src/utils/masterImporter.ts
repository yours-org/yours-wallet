import JSZip from 'jszip';
import { BLOCK_HEADER_SIZE, CaseModSPV, OneSatWebSPV } from 'ts-casemod-spv';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
import { formatNumberWithCommasAndDecimals } from './format';
import { sleep } from './sleep';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

export const restoreMasterFromZip = async (
  oneSatSpv: CaseModSPV,
  chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  file: File, // Assuming the ZIP file is passed in as a File object
) => {
  const zip = new JSZip();

  const readChromeStorage = async (zip: JSZip) => {
    progress({ message: 'Reading file storage...' });
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

  const restoreBlock = async (zip: JSZip) => {
    const lastSyncedBlock = await oneSatSpv.getSyncedBlock();
    if (lastSyncedBlock) {
      await oneSatSpv.stores.blocks?.sync(true);
      return;
    }
    progress({ message: 'Restoring blocks data...' });
    await sleep(1000);
    const folder = zip.folder('blocks');
    if (folder) {
      const files = folder.file(/\.bin$/);
      let count = 0;
      for (const headersFile of files) {
        const blocksData = await headersFile.async('uint8array');
        const endValue = (blocksData.length / BLOCK_HEADER_SIZE) * files.length;
        await oneSatSpv.restoreBlocks([...blocksData]);
        count += blocksData.length / BLOCK_HEADER_SIZE;
        progress({
          message: `Synced ${formatNumberWithCommasAndDecimals(count, 0)} blocks...`,
          endValue,
          value: count,
        });
      }
      await sleep(1000);
      progress({ message: 'Blocks data restored successfully!' });
      await sleep(1000);
    } else {
      throw new Error('Blocks data not found in zip.');
    }
  };

  const restoreTxns = async (zip: JSZip) => {
    progress({ message: 'Restoring transactions data...' });
    await sleep(1000);
    const txnFolder = zip.folder('txns');
    if (txnFolder) {
      const txns = txnFolder.file(/\.bin$/);
      let count = 0;
      const endValue = txns.length;
      for (const txnFile of txns) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const txid = txnFile.name.match(/txns\/([a-f0-9]*)\.bin/)![1]!;
        const txnData = await txnFile.async('uint8array');
        await oneSatSpv.restoreBackupTx(txid, Array.from(txnData));
        progress({
          message: `Restored ${count} of ${endValue} transactions...`,
          value: count,
          endValue,
        });
        count++;
      }
      await sleep(1000);
      progress({ message: 'Transactions restored successfully!' });
      await sleep(1000);
    } else {
      throw new Error('Transactions data not found in zip.');
    }
  };

  const restoreAccountLogs = async (zip: JSZip, accounts: Account[]) => {
    progress({ message: 'Restoring account logs...' });
    await sleep(1000);
    for (const account of accounts) {
      const accountFile = zip.file(`${account.addresses.identityAddress}.json`);
      if (!accountFile) throw new Error('Account file not found!');
      const owners = new Set<string>([
        account.addresses.bsvAddress,
        account.addresses.identityAddress,
        account.addresses.ordAddress,
      ]);
      const accountData = await accountFile.async('string');
      const logs = JSON.parse(accountData);
      const spvWallet = await OneSatWebSPV.init(account.addresses.identityAddress, [], owners);
      await spvWallet.restoreBackupLogs(logs);
      progress({ message: `Account logs for restored successfully!` });
      await sleep(1000);
    }
  };

  try {
    const zipContent = await zip.loadAsync(file);
    const chromeObject = await readChromeStorage(zipContent);
    await restoreBlock(zipContent);
    await restoreTxns(zipContent);
    await restoreAccountLogs(zipContent, Object.values(chromeObject.accounts));

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
