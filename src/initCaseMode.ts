import {
  Bsv20Indexer,
  Bsv21Indexer,
  FundIndexer,
  Indexer,
  IndexMode,
  InscriptionIndexer,
  LockIndexer,
  MapIndexer,
  OneSatWebSPV,
  OrdLockIndexer,
  OriginIndexer,
} from 'ts-casemod-spv';
import { NetWork } from 'yours-wallet-provider';
import { BlockHeightTrackerMessage } from './hooks/useBlockHeightTracker';
import { QueueTrackerMessage } from './hooks/useQueueTracker';
import { YoursEventName } from './inject';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { sendMessage } from './utils/chromeHelpers';
import walletTheme from '../src/theme.json';

export const initOneSatSPV = async (chromeStorageService: ChromeStorageService, startSync = false) => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();

  let { bsvAddress, identityAddress, ordAddress } = account?.addresses || {};
  if (!bsvAddress) bsvAddress = '';
  if (!identityAddress) identityAddress = '';
  if (!ordAddress) ordAddress = '';
  const owners = new Set<string>([bsvAddress, identityAddress, ordAddress]);
  const indexers: Indexer[] = [new FundIndexer(owners, IndexMode.TrustAndVerify, network)];

  const lockIndexer = new LockIndexer(owners, IndexMode.TrustAndVerify, network);

  const bsv20Indexers = [
    new Bsv21Indexer(owners, IndexMode.Trust, network),
    new Bsv20Indexer(owners, IndexMode.Trust, network),
  ];

  const ordIndexers = [
    new OrdLockIndexer(owners, IndexMode.TrustAndVerify, network),
    new InscriptionIndexer(owners, IndexMode.TrustAndVerify, network),
    new MapIndexer(owners, IndexMode.Verify, network),
    new OriginIndexer(owners, IndexMode.TrustAndVerify, network),
  ];

  if (walletTheme.settings.services.locks) indexers.push(lockIndexer);
  if (walletTheme.settings.services.ordinals) indexers.push(...ordIndexers);
  if (walletTheme.settings.services.bsv20) indexers.push(...bsv20Indexers);

  const oneSatSPV = await OneSatWebSPV.init(
    selectedAccount || '',
    indexers,
    owners,
    startSync && !!account,
    network == NetWork.Mainnet ? NetWork.Mainnet : NetWork.Testnet,
  );

  if (!oneSatSPV) throw Error('SPV not initialized!');

  oneSatSPV.events.on('queueStats', (queueStats: { length: number }) => {
    const message: QueueTrackerMessage = { action: YoursEventName.QUEUE_STATUS_UPDATE, data: queueStats };
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

  return oneSatSPV;
};
