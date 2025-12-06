import { NetWork } from 'yours-wallet-provider';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { TransactionParser } from './indexers/TransactionParser';
import { FundIndexer } from './indexers/FundIndexer';
import { InscriptionIndexer } from './indexers/InscriptionIndexer';
import { LockIndexer } from './indexers/LockIndexer';
import { Bsv21Indexer } from './indexers/Bsv21Indexer';
import { MapIndexer } from './indexers/MapIndexer';
import { OpNSIndexer } from './indexers/OpNSIndexer';
import { CosignIndexer } from './indexers/CosignIndexer';
import { SigmaIndexer } from './indexers/SigmaIndexer';
import { OrdLockIndexer } from './indexers/OrdLockIndexer';
import { OriginIndexer } from './indexers/OriginIndexer';
import { Indexer } from './indexers/types';
import { theme } from './theme';
import type { WalletAPI } from './services/WalletServices.service';

/**
 * Gets the set of owner addresses for the current account
 */
export const getOwners = (chromeStorageService: ChromeStorageService): Set<string> => {
  const { account } = chromeStorageService.getCurrentAccountObject();
  let { bsvAddress, identityAddress, ordAddress } = account?.addresses || {};
  if (!bsvAddress) bsvAddress = '';
  if (!identityAddress) identityAddress = '';
  if (!ordAddress) ordAddress = '';
  return new Set<string>([bsvAddress, identityAddress, ordAddress]);
};

/**
 * Gets the configured indexers for the current network and theme settings
 */
export const getIndexers = (owners: Set<string>, network: 'mainnet' | 'testnet'): Indexer[] => {
  const indexers: Indexer[] = [
    new FundIndexer(owners, network),
    new CosignIndexer(owners, network),
  ];

  const lockIndexer = new LockIndexer(owners, network);

  const bsv21Indexers = [new Bsv21Indexer(owners, network)];

  const ordIndexers = [
    new InscriptionIndexer(owners, network),
    new MapIndexer(owners, network),
    new OpNSIndexer(owners, network),
    new OrdLockIndexer(owners, network),
    new SigmaIndexer(owners, network),
    new OriginIndexer(owners, network),
  ];

  if (theme.settings.services.locks) indexers.push(lockIndexer);
  if (theme.settings.services.ordinals) indexers.push(...ordIndexers);
  if (theme.settings.services.bsv20) indexers.push(...bsv21Indexers);

  return indexers;
};

/**
 * Initializes a TransactionParser with all configured indexers
 */
export const initParser = (
  chromeStorageService: ChromeStorageService,
  walletStorage: any,
  walletServices: WalletAPI,
): TransactionParser => {
  const network = chromeStorageService.getNetwork();
  const owners = getOwners(chromeStorageService);
  const indexers = getIndexers(owners, network === NetWork.Mainnet ? 'mainnet' : 'testnet');

  return new TransactionParser(indexers, owners, walletStorage, walletServices);
};
