import { Network, StoresService, StoresServices } from '../stores-service';
import { Indexer } from '../txo-store/models/indexer';
import { OneSatService } from './1sat-service';

const APIS = {
  [Network.Mainnet]: 'https://ordinals.gorillapool.io',
  [Network.Testnet]: 'https://testnet.ordinals.gorillapool.io',
};

export function init1SatServices(network = Network.Mainnet): StoresServices {
  const oneSatService = new OneSatService(APIS[network]);
  return {
    blocks: oneSatService,
    txns: oneSatService,
    broadcast: oneSatService,
    inv: oneSatService,
  };
}

export async function init1SatStores(
  accountId: string,
  indexers: Indexer[] = [],
  owners: Set<string> = new Set<string>(),
  startSync = false,
  network = Network.Mainnet,
): Promise<StoresService> {
  return StoresService.init(
    accountId,
    init1SatServices(network),
    indexers,
    owners,
    startSync,
    () => undefined,
    network,
  );
}
