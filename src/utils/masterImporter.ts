import JSZip from 'jszip';
import { CaseModSPV, OneSatWebSPV } from 'ts-casemod-spv';
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
  oneSatSpv: CaseModSPV,
  chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
  file: File, // Assuming the ZIP file is passed in as a File object
) => {
  const zip = new JSZip();

  const readChromeStorage = async (zip: JSZip) => {
    progress({ message: 'Reading Chrome storage...' });
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
    progress({ message: 'Restoring blocks data...' });
    const blocksFile = zip.file('block.json');
    console.log('made it here');
    if (blocksFile) {
      const blocksData = await blocksFile.async('string');
      console.log('made it here 2');
      console.log(blocksData.slice(0, 100));
      const blocks = JSON.parse(blocksData);
      for (let i = 0; i < blocks.length; i += 10000) {
        await oneSatSpv.restoreBlocks(blocks.slice(i, i + 10000));
        progress({ message: `Processed blocks ${i}` });
      }
      progress({ message: 'Blocks data restored successfully!' });
    } else {
      throw new Error('Blocks data not found in zip.');
    }
  };

  const restoreTxns = async (zip: JSZip) => {
    progress({ message: 'Restoring transactions data...' });
    const txnFolder = zip.folder('txns');
    if (txnFolder) {
      const txns = txnFolder.file(/\.bin$/);
      let count = 0;
      const endValue = txns.length;
      console.time('import');
      for (const txnFile of txns) {
        const txid = txnFile.name.replace('.bin', '');
        console.time(txid);
        const txnData = await txnFile.async('uint8array');
        console.timeLog(txid, 'read data');
        await oneSatSpv.restoreBackupTx(Array.from(txnData));
        console.timeLog(txid, 'restored data');
        console.log(`Restored transaction with txid: ${txid}`);
        count++;
        progress({
          message: `Restored ${count} of ${endValue} transactions...`,
          value: count,
          endValue,
        });
        console.timeEnd(txid);
      }
      console.timeEnd('import');
      progress({ message: 'Transactions restored successfully!' });
    } else {
      throw new Error('Transactions data not found in zip.');
    }
  };

  const restoreAccountLogs = async (zip: JSZip, accounts: Account[]) => {
    progress({ message: 'Restoring account logs...' });
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
      progress({ message: `Account logs for ${accountFile.name.replace('.json', '')} restored successfully!` });
    }
  };

  try {
    const zipContent = await zip.loadAsync(file);
    const chromeObject = await readChromeStorage(zipContent);
    // await restoreBlock(zipContent);
    // await restoreTxns(zipContent);
    await restoreAccountLogs(zipContent, Object.values(chromeObject.accounts));

    await chromeStorageService.update(chromeObject);
    progress({ message: 'Chrome storage restored successfully!' });
    await sleep(1000);
    progress({ message: 'Master restore complete!' });
  } catch (error) {
    console.error('Failed to restore zip file', error);
    progress({ message: 'Failed to restore backup, see console for details.' });
  }
};
