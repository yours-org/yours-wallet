import {
  Bsv20Indexer,
  Bsv21Indexer,
  FundIndexer,
  Indexer,
  IndexMode,
  InscriptionIndexer,
  LockIndexer,
  MapIndexer,
  OneSatIndexer,
  OneSatWebSPV,
  OrdLockIndexer,
  OriginIndexer,
  SigmaIndexer,
} from 'spv-store';
import { NetWork } from 'yours-wallet-provider';
import { BlockHeightTrackerMessage } from './hooks/useBlockHeightTracker';
import { FetchingMessage, ImportTrackerMessage, QueueTrackerMessage } from './hooks/useQueueTracker';
import { YoursEventName } from './inject';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { sendMessage } from './utils/chromeHelpers';
import { theme } from './theme';

export const initOneSatSPV = async (chromeStorageService: ChromeStorageService, startSync = false) => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();

  let { bsvAddress, identityAddress, ordAddress } = account?.addresses || {};
  if (!bsvAddress) bsvAddress = '';
  if (!identityAddress) identityAddress = '';
  if (!ordAddress) ordAddress = '';
  const owners = new Set<string>([bsvAddress, identityAddress, ordAddress]);
  const indexers: Indexer[] = [new FundIndexer(owners, network)];

  const lockIndexer = new LockIndexer(owners, network);

  const bsv20Indexers = [
    new Bsv21Indexer(owners, IndexMode.Trust, [], network),
    new Bsv20Indexer(owners, IndexMode.Trust, network),
  ];

  const ordIndexers = [
    // new OneSatIndexer(owners, network),
    new OrdLockIndexer(owners, network),
    new InscriptionIndexer(owners, network),
    new MapIndexer(owners, network),
    new SigmaIndexer(owners, network),
    new OriginIndexer(owners, network),
  ];

  if (theme.settings.services.locks) indexers.push(lockIndexer);
  if (theme.settings.services.ordinals) indexers.push(...ordIndexers);
  if (theme.settings.services.bsv20) indexers.push(...bsv20Indexers);

  const oneSatSPV = await OneSatWebSPV.init(
    selectedAccount || '',
    indexers,
    owners,
    startSync && !!account,
    new Set<string>(['lock', 'fund', 'origin']),
    network == NetWork.Mainnet ? NetWork.Mainnet : NetWork.Testnet,
  );

  if (!oneSatSPV) throw Error('SPV not initialized!');

  await registerEventListeners(oneSatSPV, selectedAccount || '', startSync);

  return oneSatSPV;
};

const registerEventListeners = async (oneSatSPV: OneSatWebSPV, selectedAccount: string, startSync: boolean) => {
  oneSatSPV.events.on('queueStats', (data: { length: number }) => {
    const message: QueueTrackerMessage = { action: YoursEventName.QUEUE_STATUS_UPDATE, data };
    try {
      sendMessage(message);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  });

  oneSatSPV.events.on('importing', (data: { tag: string; name: string }) => {
    const message: ImportTrackerMessage = { action: YoursEventName.IMPORT_STATUS_UPDATE, data };
    try {
      sendMessage(message);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  });

  oneSatSPV.events.on('fetchingTx', (data: { txid: string }) => {
    const message: FetchingMessage = { action: YoursEventName.FETCHING_TX_STATUS_UPDATE, data };
    try {
      sendMessage(message);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  });

  if (startSync) {
    const tip = await oneSatSPV.getChaintip();
    oneSatSPV.events.on('syncedBlockHeight', (lastHeight: number) => {
      try {
        const message: BlockHeightTrackerMessage = {
          action: YoursEventName.BLOCK_HEIGHT_UPDATE,
          data: { currentHeight: tip?.height || 0, lastHeight },
        };
        selectedAccount && sendMessage(message);
        // eslint-disable-next-line no-empty
      } catch (error) {}
    });
  }
};
