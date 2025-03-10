import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { OneSatWebSPV } from 'spv-store';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { sleep } from './sleep';
import { getIndexers, getOwners } from '../initSPVStore';

export type MasterBackupProgressEvent = {
  message: string;
  value?: number;
  endValue?: number;
};

type MasterBackupProgress = (event: MasterBackupProgressEvent) => void;

// TODO: handle UI errors if it ever becomes a problem
export const streamDataToZip = async (chromeStorageService: ChromeStorageService, progress: MasterBackupProgress) => {
  const zip = new JSZip();

  const zipChromeObject = async (zip: JSZip) => {
    progress({ message: 'Gathering data for all accounts...' });
    await sleep(1000); // UX thing again...
    const chromeObject = await chromeStorageService.getAndSetStorage();
    zip.file('chromeStorage.json', JSON.stringify(chromeObject));
    progress({ message: 'Account data collected successfully!' });
    await sleep(1000); // UX thing again...
  };

  try {
    const accounts = chromeStorageService.getAllAccounts();
    let txnsLoaded = false;
    const network = chromeStorageService.getNetwork();
    for (const account of accounts) {
      const owners = getOwners(chromeStorageService);
      const indexers = getIndexers(owners, network);
      const spvWallet = await OneSatWebSPV.init(account.addresses.identityAddress, indexers);

      let from = undefined;
      let page = 0;
      let hasNextPage = true;
      progress({ message: `Gathering Txos for ${account.addresses.identityAddress}...` }); // UX thing again...
      await sleep(1000); // UX thing again...
      while (hasNextPage) {
        //@ts-ignore
        const { txos, nextPage } = await spvWallet.backupTxos(100, from);
        progress({ message: `Processing txo page ${page + 1}...` });
        zip.file(
          `txos-${account.addresses.identityAddress}-${(page++).toString().padStart(4, '0')}.json`,
          JSON.stringify(txos),
        );
        hasNextPage = !!nextPage;
        from = nextPage;
      }

      from = undefined;
      page = 0;
      hasNextPage = true;
      while (hasNextPage) {
        //@ts-ignore
        const { logs, nextPage } = await spvWallet.backupTxLogs(100, from);
        progress({ message: `Processing txo page ${page + 1}...` });
        zip.file(
          `txlogs-${account.addresses.identityAddress}-${(page++).toString().padStart(4, '0')}.json`,
          JSON.stringify(logs),
        );
        hasNextPage = !!nextPage;
        from = nextPage;
      }

      if (!txnsLoaded) {
        from = undefined;
        page = 0;
        hasNextPage = true;
        progress({ message: `Gathering Txns...` }); // UX thing again...
        await sleep(1000); // UX thing again...
        while (hasNextPage) {
          //@ts-ignore
          const { data, nextPage } = await spvWallet.backupTxns(100, from);
          progress({ message: `Processing txn page ${page + 1}...` });
          zip.file(`txns-${(page++).toString().padStart(4, '0')}.bin`, Buffer.from(data));
          hasNextPage = !!nextPage;
          from = nextPage;
        }
        txnsLoaded = true;
      }

      progress({ message: 'Account dependencies calculated successfully!' });
      await spvWallet.destroy();
    }

    await zipChromeObject(zip);

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
