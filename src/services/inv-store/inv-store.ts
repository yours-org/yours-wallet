import { DBSchema, IDBPDatabase, openDB } from '@tempfix/idb';
import { InventoryService, TxLog } from './inv-service';
import { NetWork } from 'yours-wallet-provider';
import EventEmitter from 'events';

interface InvSchema extends DBSchema {
  txLog: {
    key: [string, string];
    value: TxLog;
    indexes: {
      height: [number, number];
    };
  };
}

const INV_DB_VERSION = 1;

export class InventoryStore extends EventEmitter {
  private interval: NodeJS.Timeout | undefined;
  private constructor(
    public invDb: IDBPDatabase<InvSchema>,
    public owners: Set<string>,
    public invService: InventoryService,
  ) {
    super();
  }

  static async init(
    accountId: string,
    owners = new Set<string>(),
    invService: InventoryService,
    network = NetWork.Mainnet,
  ): Promise<InventoryStore> {
    const invDb = await openDB<InvSchema>(`inv-${accountId}-${network}`, INV_DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('txLog', { keyPath: ['owner', 'txid'] }).createIndex('height', ['owner', 'height', 'idx']);
      },
    });
    return new InventoryStore(invDb, owners, invService);
  }

  sync() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.syncTxLogs(0), 60000);
    this.invDb.close();
  }

  async destroy() {
    if (this.interval) clearInterval(this.interval);
    this.invDb.close();
    this.removeAllListeners();
  }

  async getLastSyncHeight(owner: string) {
    const t = this.invDb.transaction('txLog', 'readonly');
    const cursor = await t.store.index('height').openCursor(IDBKeyRange.upperBound([owner, 50000000]), 'prev');
    const height = cursor?.value.height || 0;
    await t.done;
    return height;
  }

  async syncTxLogs(fromHeight: number) {
    if (!this.invService) return [];
    const latestLogs = await Promise.all([
      ...Array.from(this.owners).map((owner) =>
        this.getLastSyncHeight(owner).then((height) => ({ owner, latest: height || fromHeight })),
      ),
    ]);

    for (const latestLog of latestLogs) {
      if (!latestLog) continue;
      const logs = await this.invService.pollTxLogs(latestLog.owner, latestLog.latest);
      const t = this.invDb.transaction('txLog', 'readwrite');
      await Promise.all([
        ...logs.map(async (log) => {
          const existing = await t.store.get([log.owner, log.txid]);
          if (existing && existing.height == log.height && existing.idx == log.idx) return;
          t.store.put(log);
          this.emit('tx', log);
        }),
        t.done,
      ]);
    }
  }
}
