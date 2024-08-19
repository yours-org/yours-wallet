import type { ChainTracker } from '@bsv/sdk';
import { openDB, type DBSchema, type IDBPDatabase } from '@tempfix/idb';
import { Network, StoresServices } from '../stores-service';

const VERSION = 1;
const PAGE_SIZE = 10000;

export interface BlockHeaderService {
  getBlocks(lastHeight: number, limit: number): Promise<BlockHeader[]>;
  getChaintip(): Promise<BlockHeader>;
}

export interface BlockHeader {
  hash: string;
  height: number;
  version: number;
  prevHash: string;
  merkleroot: string;
  time: number;
  bits: number;
  nonce: number;
}

export interface BlockSchema extends DBSchema {
  headers: {
    key: number;
    value: BlockHeader;
    indexes: {
      byHash: string;
    };
  };
}

export class BlockStore implements ChainTracker {
  private syncInProgress = false;
  private stopSync = false;
  private constructor(
    public db: IDBPDatabase<BlockSchema>,
    public services: StoresServices,
  ) {}

  static async init(
    services: StoresServices,
    network: Network = Network.Mainnet,
    startSync = false,
  ): Promise<BlockStore> {
    const db = await openDB<BlockSchema>(`blocks-${network}`, VERSION, {
      upgrade(db) {
        const headers = db.createObjectStore('headers', { keyPath: 'height' });
        headers.createIndex('byHash', 'hash');
      },
    });

    const store = new BlockStore(db, services);
    if (startSync) store.sync();
    return store;
  }

  destroy() {
    this.stopSync = true;
    this.db.close();
  }

  async sync() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    let lastHeight = 1;
    const db = await this.db;
    const cursor = await db.transaction('headers').store.openCursor(null, 'prev');
    if (cursor) {
      lastHeight = cursor.key > 5 ? cursor.key - 5 : 1;
    }

    try {
      let blocks = await this.services.blocks.getBlocks(lastHeight, PAGE_SIZE);
      do {
        console.log('Syncing from', lastHeight);
        const t = db.transaction('headers', 'readwrite');
        for (const block of blocks) {
          t.store.put(block);
          lastHeight = block.height + 1;
        }
        await t.done;
        blocks = await this.services.blocks.getBlocks(lastHeight, PAGE_SIZE);
        if (this.stopSync) break;
      } while (blocks.length == PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      this.stopSync = false;
      this.syncInProgress = false;
      setTimeout(() => this.sync(), 1000 * 60);
    }
  }

  async isValidRootForHeight(root: string, height: number): Promise<boolean> {
    const db = await this.db;
    const block = await db.get('headers', height);
    return block?.merkleroot == root;
  }

  async getHashByHeight(height: number): Promise<string | undefined> {
    const db = await this.db;
    return (await db.get('headers', height))?.hash;
  }

  async getHeightByHash(hash: string): Promise<number | undefined> {
    const db = await this.db;
    return (await db.getFromIndex('headers', 'byHash', hash))?.height;
  }

  async getSyncedBlock(): Promise<BlockHeader | undefined> {
    const db = await this.db;
    const cursor = await db.transaction('headers').store.openCursor(null, 'prev');
    return cursor?.value;
  }

  async getChaintip(): Promise<BlockHeader> {
    return this.services.blocks.getChaintip();
  }
}
