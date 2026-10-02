import { useCallback, useEffect, useState } from 'react';
import {
  RECONCILE_RECORD_KEY,
  reconcileOutcome,
  type ReconcileOutcome,
  type ReconcilePhase,
  type ReconcileRecord,
} from '../services/storageReconcile';
import { sendMessageAsync } from '../utils/chromeHelpers';

export const REPAIR_PHASE_LABELS: Record<ReconcilePhase, string> = {
  'read-local': 'Reading local storage',
  'read-remote': 'Reading remote storage',
  'check-chain': 'Checking spends on chain',
  'push-to-remote': 'Copying local records to remote',
  'push-to-local': 'Copying remote records to local',
  'apply-corrections': 'Applying spend corrections',
  'push-corrections': 'Sending corrections to remote',
  verify: 'Verifying both stores match',
};

export type RepairResponse = { success: boolean; error?: string; data?: { outcome: ReconcileOutcome } };

/**
 * The last storage repair (reconcile) run on this device, live: the background
 * rewrites the record as each phase starts and after every chunk.
 */
export const useStorageRepair = () => {
  const [record, setRecord] = useState<ReconcileRecord | undefined>();

  useEffect(() => {
    chrome.storage.local.get(RECONCILE_RECORD_KEY).then((r) => setRecord(r[RECONCILE_RECORD_KEY]));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && RECONCILE_RECORD_KEY in changes) setRecord(changes[RECONCILE_RECORD_KEY].newValue);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const runRepair = useCallback(() => sendMessageAsync<RepairResponse>({ action: 'STORAGE_REPAIR_SYNC' }), []);

  /** Dismiss a finished run's result so the overlay stops showing it. */
  const acknowledge = useCallback(async () => {
    const current = (await chrome.storage.local.get(RECONCILE_RECORD_KEY))[RECONCILE_RECORD_KEY] as
      | ReconcileRecord
      | undefined;
    if (!current?.finishedAt) return;
    await chrome.storage.local.set({ [RECONCILE_RECORD_KEY]: { ...current, acknowledged: true } });
  }, []);

  return { record, outcome: record ? reconcileOutcome(record) : undefined, runRepair, acknowledge };
};
