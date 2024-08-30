import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { CaseModSPV } from 'ts-casemod-spv';
import { ChromeStorageService } from '../services/ChromeStorage.service';

export const streamDataToZip = async (
  oneSatSpv: CaseModSPV,
  chromeStorageService: ChromeStorageService,
  eventCallback: (num: number) => void,
) => {
  const zip = new JSZip();

  const zipChromeObject = async (zip: JSZip) => {
    const chromeObject = await chromeStorageService.getAndSetStorage();
    zip.file('chromeStorage.json', JSON.stringify(chromeObject));
  };

  const zipBlock = async (zip: JSZip) => {
    const blocks = await oneSatSpv.getAllBlocks();
    zip.file('block.json', JSON.stringify(blocks));
  };

  const zipTxns = async (zip: JSZip) => {
    const txids = await oneSatSpv.getTxids();
    const txnFolder = zip.folder('txns');
    if (!txnFolder) throw new Error('Txn folder not found');
    let count = 0;
    for (const txid of txids) {
      eventCallback(count);
      const tx = await oneSatSpv.getTx(txid);
      if (!tx) {
        console.error(`Failed to get tx with txid: ${txid}`);
        continue;
      }
      txnFolder.file(`${txid}.bin`, Buffer.from(tx.toBinary()));
      count++;
    }
  };

  try {
    await zipChromeObject(zip);
    await zipBlock(zip);
    await zipTxns(zip);

    // Generate zip file and trigger download
    console.log('Compressing data...');
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    console.log('The process is done');
    saveAs(content, 'yours_master_backup.zip');
  } catch (error) {
    console.error('Failed to create zip file', error);
  }
};
