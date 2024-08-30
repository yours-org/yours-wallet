import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { CaseModSPV } from 'ts-casemod-spv';
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
  oneSatSpv: CaseModSPV,
  chromeStorageService: ChromeStorageService,
  progress: MasterBackupProgress,
) => {
  const zip = new JSZip();

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
    const blocks = await oneSatSpv.getAllBlocks();
    zip.file('block.json', JSON.stringify(blocks));
    progress({ message: 'Blocks data collected successfully!' });
    await sleep(1000); // UX thing again...
  };

  const zipTxns = async (zip: JSZip) => {
    progress({ message: 'Getting Txns data...' });
    const txids = await oneSatSpv.getTxids();
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
      const tx = await oneSatSpv.getTx(txid);
      if (!tx) {
        console.error(`Failed to get tx with txid: ${txid}`);
        errorCount++;
        continue;
      }
      txnFolder.file(`${txid}.bin`, Buffer.from(tx.toBinary()));
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
    await zipChromeObject(zip);
    await zipBlock(zip);
    await zipTxns(zip);

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
