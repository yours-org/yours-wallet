import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { SPVStore, Ingest, OneSatWebSPV } from 'spv-store';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { sleep } from './sleep';
import { formatNumberWithCommasAndDecimals } from './format';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

// TODO: should probably handle errors?
export const streamDataToZip = async (
  oneSatSpv: SPVStore,
  chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
) => {
  const zip = new JSZip();

  const zipAccountLogs = async (accountId: string, zip: JSZip): Promise<Ingest[]> => {
    progress({ message: `Calculating dependencies for ${accountId}...` }); // UX thing again...
    await sleep(1000); // UX thing again...
    const spvWallet = await OneSatWebSPV.init(accountId, []);
    const logs = await spvWallet.getBackupLogs();
    zip.file(`${accountId}.json`, JSON.stringify(logs));
    progress({ message: 'Account dependencies calculated successfully!' });
    await spvWallet.destroy();
    await sleep(1000); // UX thing again...
    return logs;
  };
  const zipChromeObject = async (zip: JSZip) => {
    progress({ message: 'Gathering data for all accounts...' });
    await sleep(1000); // This is really just a UX thing to show user what we are doing...
    const chromeObject = await chromeStorageService.getAndSetStorage();
    zip.file('chromeStorage.json', JSON.stringify(chromeObject));
    progress({ message: 'Account data collected successfully!' });
    await sleep(1000); // UX thing again...
  };

  const zipBlock = async (zip: JSZip) => {
    progress({ message: 'Getting blocks data...' }); // UX thing again...
    const blocks = await oneSatSpv.getBlocksBackup();
    const folder = zip.folder('blocks');
    if (!folder) throw new Error('Blocks folder not found');
    for (const [i, headers] of blocks.entries()) {
      folder.file(`${i.toString().padStart(3, '0')}.bin`, Buffer.from(headers));
    }
    progress({ message: 'Blocks data collected successfully!' });
    await sleep(1000); // UX thing again...
  };

  const zipTxns = async (txids: string[], zip: JSZip) => {
    progress({ message: 'Getting Txns data...' });
    const txnFolder = zip.folder('txns');
    if (!txnFolder) throw new Error('Txn folder not found');
    let count = 0;
    let errorCount = 0;
    const endValue = txids.length;
    for (const txid of txids) {
      progress({
        message: `Processed ${formatNumberWithCommasAndDecimals(count, 0)} of ${formatNumberWithCommasAndDecimals(endValue, 0)} txns...`,
        value: count,
        endValue,
      });
      const tx = await oneSatSpv.getBackupTx(txid);
      if (!tx) {
        console.error(`Failed to get tx with txid: ${txid}`);
        errorCount++;
        continue;
      }
      txnFolder.file(`${txid}.bin`, Buffer.from(tx));
      count++;
    }
    progress({
      message: `Processed ${formatNumberWithCommasAndDecimals(endValue, 0)} of ${formatNumberWithCommasAndDecimals(endValue, 0)} txns...`,
      value: count,
      endValue,
    });
    await sleep(1000); // UX thing again...
    progress({ message: 'Txns process complete!' });
    console.warn(`Failed to get ${errorCount} txns`);
    await sleep(1000); // UX thing again...
  };

  try {
    const accounts = chromeStorageService.getAllAccounts();
    const txids = new Set<string>();
    for (const account of accounts) {
      const logs = await zipAccountLogs(account.addresses.identityAddress, zip);
      logs.forEach((log) => txids.add(log.txid));
    }

    await zipChromeObject(zip);
    await zipBlock(zip);
    await zipTxns(Array.from(txids), zip);

    // Generate zip file and trigger download
    progress({ message: 'Almost done, compressing data...' });
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(content, 'yours_master_backup.zip');
    progress({ message: 'Master export complete!' });
    await sleep(2000); // UX thing again...
    progress({ message: '' });
  } catch (error) {
    console.error('Failed to create zip file', error);
  }
};
