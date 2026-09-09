export const DEFAULT_ADDRESS_SYNC_INTERVAL_MS = 60_000;

export const ADDRESS_SYNC_TASK_NAME = 'AddressSync';

export function buildAddressSyncTask(
  monitor: { storage?: unknown },
  triggerMsecs: number,
  options: { run: () => Promise<unknown> },
): {
  monitor: unknown;
  storage: unknown;
  name: string;
  lastRunMsecsSinceEpoch: number;
  asyncSetup: () => Promise<void>;
  trigger: (nowMsecsSinceEpoch: number) => { run: boolean };
  runTask: () => Promise<string>;
} {
  const interval = triggerMsecs > 0 ? triggerMsecs : DEFAULT_ADDRESS_SYNC_INTERVAL_MS;
  return {
    monitor,
    storage: monitor.storage,
    name: ADDRESS_SYNC_TASK_NAME,
    lastRunMsecsSinceEpoch: 0,
    async asyncSetup() {},
    trigger(nowMsecsSinceEpoch: number): { run: boolean } {
      if (nowMsecsSinceEpoch - this.lastRunMsecsSinceEpoch < interval) {
        return { run: false };
      }
      return { run: true };
    },
    async runTask(): Promise<string> {
      try {
        await options.run();
        return 'sync complete';
      } catch (err) {
        return `sync failed: ${(err as Error).message}`;
      }
    },
  };
}
