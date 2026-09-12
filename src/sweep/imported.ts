import {
  bsv21SweepBatches,
  groupBsv20Tokens,
  prepareSweepInputs,
  SWEEP_BATCH_SIZE,
  sweepBsv,
  sweepBsv20,
  sweepBsv21,
  sweepOrdinals,
  type OneSatContext,
  type SweepInput,
} from '@1sat/actions';
import type { IndexedOutput } from '@1sat/types';
import { formatOutpoint, parseOutpoint } from '@1sat/utils';
import { PrivateKey } from '@bsv/sdk';
import type { Keys } from '../utils/keys';
import type { ScannedAssets } from './scanner';
import type { SweepSelection, SweepTxResult } from './types';

/** Canonical `txid.vout` form: indexer, overlay, and SDK inputs mix `.` and `_` separators. */
const normalizeOutpoint = (outpoint: string) => {
  const { txid, vout } = parseOutpoint(outpoint);
  return formatOutpoint(txid, vout);
};

export function importedKeyMap(keys: Pick<Keys, 'walletWif' | 'ordWif' | 'identityWif'>): Map<string, PrivateKey> {
  const result = new Map<string, PrivateKey>();
  for (const wif of [keys.walletWif, keys.ordWif, keys.identityWif]) {
    if (!wif) continue;
    const key = PrivateKey.fromWif(wif);
    result.set(key.toPublicKey().toAddress(), key);
  }
  return result;
}

/** prepareSweepInputs groups by transaction, so match each prepared outpoint to its actual owner. */
export function keysForPreparedInputs(
  inputs: SweepInput[],
  outputs: IndexedOutput[],
  keys: Map<string, PrivateKey>,
): PrivateKey[] {
  const byOutpoint = new Map(outputs.map((output) => [normalizeOutpoint(output.outpoint), output]));
  return inputs.map((input) => {
    const output = byOutpoint.get(normalizeOutpoint(input.outpoint));
    const owners = new Set(
      (output?.events ?? []).filter((event) => event.startsWith('own:')).map((event) => event.slice(4)),
    );
    const matches = [...owners].filter((owner) => keys.has(owner));
    if (matches.length !== 1)
      throw new Error(`Cannot match imported owner for ${input.outpoint}. Rescan before retrying.`);
    return keys.get(matches[0])!;
  });
}

/**
 * Same class order as `1sat sweep import`: BSV, ordinals, OpNS, BSV-20, BSV-21.
 * Listed OrdLocks stay in their class and cancel into the destination in that spend.
 */
export async function sweepImportedAssets(
  context: OneSatContext,
  assets: ScannedAssets,
  keys: Map<string, PrivateKey>,
  selection: SweepSelection,
  options: {
    signal: AbortSignal;
    completed: Set<string>;
    onProgress: (message: string) => void;
    onResult: (result: SweepTxResult) => void;
  },
): Promise<void> {
  const { signal, completed, onProgress, onResult } = options;
  const remaining = (outputs: IndexedOutput[]) =>
    outputs.filter((output) => !completed.has(normalizeOutpoint(output.outpoint)));
  const perform = async (
    type: SweepTxResult['type'],
    label: string,
    outputs: IndexedOutput[],
    execute: (inputs: SweepInput[], keys: PrivateKey[]) => Promise<{ txid?: string; error?: string }>,
  ): Promise<boolean> => {
    const pending = remaining(outputs);
    if (!pending.length) return true;
    onProgress(label);
    try {
      signal.throwIfAborted();
      await context.wallet.getPublicKey({ identityKey: true });
      const inputs = await prepareSweepInputs(context, pending);
      const inputKeys = keysForPreparedInputs(inputs, pending, keys);
      signal.throwIfAborted();
      const result = await execute(inputs, inputKeys);
      const txid = result.txid?.trim() || undefined;
      const error = result.error || (!txid ? 'Transaction did not complete. Retry.' : undefined);
      onResult({ type, label, txid, error });
      if (error) return false;
      for (const output of pending) completed.add(normalizeOutpoint(output.outpoint));
      return true;
    } catch (error) {
      if (signal.aborted) throw error;
      onResult({ type, label, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const performOrdinalBatches = async (label: string, outputs: IndexedOutput[]) => {
    const pending = remaining(outputs);
    for (let offset = 0; offset < pending.length; offset += SWEEP_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + SWEEP_BATCH_SIZE);
      if (
        !(await perform(
          'ordinals',
          pending.length <= SWEEP_BATCH_SIZE
            ? label
            : `${label} (${offset + 1}–${offset + batch.length} of ${pending.length})`,
          batch,
          (inputs, inputKeys) => sweepOrdinals.execute(context, { inputs, keys: inputKeys }),
        ))
      )
        break;
    }
  };

  signal.throwIfAborted();
  if (selection.sweepBsv) {
    await perform('bsv', `BSV (${assets.totalBsv.toLocaleString()} sats)`, assets.funding, (inputs, inputKeys) =>
      sweepBsv.execute(context, { inputs, keys: inputKeys, amount: selection.bsvAmount }),
    );
  }

  const ordinals = assets.ordinals.filter((output) => selection.selectedOrdinals.has(output.outpoint));
  await performOrdinalBatches('Ordinals', ordinals);

  const opns = assets.opnsNames.filter((output) => selection.selectedOrdinals.has(output.outpoint));
  await performOrdinalBatches('OpNS', opns);

  for (const token of groupBsv20Tokens(assets.bsv20Tokens)) {
    signal.throwIfAborted();
    if (!selection.selectedBsv20Ticks.has(token.tick)) continue;
    await perform('bsv20', token.tick, token.outputs, (inputs, inputKeys) =>
      sweepBsv20.execute(context, {
        inputs: inputs.map((input) => ({
          ...input,
          tick: token.tick,
          amount: token.amounts.get(input.outpoint) ?? token.amounts.get(normalizeOutpoint(input.outpoint)) ?? '0',
        })),
        keys: inputKeys,
      }),
    );
  }

  for (const token of assets.bsv21Tokens) {
    signal.throwIfAborted();
    if (!selection.selectedBsv21TokenIds.has(token.tokenId)) continue;
    const amounts = new Map([...token.amounts].map(([outpoint, amount]) => [normalizeOutpoint(outpoint), amount]));
    for (const batch of bsv21SweepBatches(token.outputs)) {
      await perform('bsv21', token.symbol || token.tokenId, batch, (inputs, inputKeys) =>
        sweepBsv21.execute(context, {
          inputs: inputs.map((input) => {
            const amount = amounts.get(normalizeOutpoint(input.outpoint));
            if (amount === undefined) throw new Error('Token amount was not validated. Rescan before retrying.');
            return { ...input, tokenId: token.tokenId, amount };
          }),
          keys: inputKeys,
        }),
      );
    }
  }
}
