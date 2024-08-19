import { NetWork } from 'yours-wallet-provider';
import { BlockHeaderService, BlockStore } from './block-store/block-service';
import { InventoryStore } from './inv-store/inv-store';
import { TxnStore } from './txn-store/txn-store';
import { Indexer } from './txo-store/models/indexer';
import { TxoStore } from './txo-store/txo-store';
import { TxnService } from './txn-store/txn-service';
import { BroadcastService } from './broadcast-service/broadcast-service';
import { InventoryService } from './inv-store/inv-service';
import EventEmitter from 'events';

export const enum Network {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

export interface StoresServices {
  blocks: BlockHeaderService;
  txns: TxnService;
  broadcast: BroadcastService;
  inv: InventoryService;
}

export class StoresService extends EventEmitter {
  private constructor(
    public services: StoresServices,
    public blocks: BlockStore,
    public txns: TxnStore,
    public txos: TxoStore,
    public inv: InventoryStore,
  ) {
    super();
  }

  static async init(
    accountId: string,
    services: StoresServices,
    indexers: Indexer[] = [],
    owners: Set<string> = new Set<string>(),
    startSync = false,
    notifyQueueStats?: (queueStats: { length: number }) => void,
    network = Network.Mainnet,
  ): Promise<StoresService> {
    const blocks = await BlockStore.init(services, network, startSync);
    const txns = await TxnStore.init(services.txns, services.broadcast, blocks, network);
    const inv = await InventoryStore.init(accountId, owners, services.inv, network);
    const txos = await TxoStore.init(accountId, indexers, txns, inv, startSync, notifyQueueStats, network);
    return new StoresService(services, blocks, txns, txos, inv);
  }

  destroy() {
    this.blocks.destroy();
    this.txns.destroy();
    this.txos.destroy();
    this.inv.destroy();
  }

  sync() {
    this.blocks.sync();
    this.txos.sync();
    this.inv.sync();
  }
}
