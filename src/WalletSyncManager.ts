/**
 * WalletSyncManager - Handles all sync operations for yours-wallet service worker.
 *
 * Responsibilities:
 * - Queue processing (internalizing external payments from SSE queue)
 * - Transaction lifecycle (broadcasting pending txs, getting proofs)
 */

import type { WalletInterface } from '@bsv/sdk';
import {
  Monitor,
  type MonitorOptions,
  type WalletStorageManager,
} from '@bsv/wallet-toolbox-mobile';
import {
  AddressSyncProcessor,
  type AddressSyncQueueStorage,
  AddressManager,
  OneSatServices,
} from '@1sat/wallet-browser';

type Chain = 'main' | 'test';

export interface WalletSyncManagerOptions {
  wallet: WalletInterface;
  storage: WalletStorageManager;
  services: OneSatServices;
  syncQueue: AddressSyncQueueStorage;
  addressManager: AddressManager;
  chain: Chain;
  onTransactionBroadcasted?: (txid: string) => void;
  onTransactionProven?: (txid: string) => void;
}

export class WalletSyncManager {
  private processor: AddressSyncProcessor;
  private monitor: Monitor | null = null;
  private readonly wallet: WalletInterface;
  private readonly storage: WalletStorageManager;
  private readonly services: OneSatServices;
  private readonly chain: Chain;
  private readonly onTransactionBroadcasted?: (txid: string) => void;
  private readonly onTransactionProven?: (txid: string) => void;

  constructor(options: WalletSyncManagerOptions) {
    this.wallet = options.wallet;
    this.storage = options.storage;
    this.services = options.services;
    this.chain = options.chain;
    this.onTransactionBroadcasted = options.onTransactionBroadcasted;
    this.onTransactionProven = options.onTransactionProven;

    // Create queue processor for external payment sync
    this.processor = new AddressSyncProcessor({
      wallet: options.wallet,
      services: options.services,
      syncQueue: options.syncQueue,
      addressManager: options.addressManager,
      network: options.chain === 'main' ? 'mainnet' : 'testnet',
    });
  }

  /**
   * Start all sync operations.
   */
  async start(): Promise<void> {
    // Start queue processor
    this.processor.start().catch((error) => {
      console.error('[WalletSyncManager] Failed to start processor:', error);
    });

    // Create and start monitor for transaction lifecycle
    const monitorOptions: MonitorOptions = {
      chain: this.chain,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      services: this.services as any,
      storage: this.storage,
      chaintracks: this.services.chaintracks,
      msecsWaitPerMerkleProofServiceReq: 500,
      taskRunWaitMsecs: 5000,
      abandonedMsecs: 1000 * 60 * 5, // 5 minutes
      unprovenAttemptsLimitTest: 10,
      unprovenAttemptsLimitMain: 144,
      onTransactionProven: async (status) => {
        console.log('[WalletSyncManager] Transaction proven:', status.txid);
        this.onTransactionProven?.(status.txid);
      },
      onTransactionBroadcasted: async (result) => {
        console.log('[WalletSyncManager] Transaction broadcasted:', result);
        if (result.txid) {
          this.onTransactionBroadcasted?.(result.txid);
        }
      },
    };

    this.monitor = new Monitor(monitorOptions);
    this.monitor.addDefaultTasks();
    await this.monitor.startTasks();
  }

  /**
   * Stop all sync operations.
   */
  async stop(): Promise<void> {
    this.processor.stop();

    if (this.monitor) {
      this.monitor.stopTasks();
      await this.monitor.destroy();
      this.monitor = null;
    }
  }

  /**
   * Get the processor for event binding.
   */
  getProcessor(): AddressSyncProcessor {
    return this.processor;
  }
}
