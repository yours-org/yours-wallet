import {
  prepareSweepInputs,
  sweepBsv,
  sweepOrdinals,
  sweepBsv21,
  type OneSatContext,
  type SweepInput,
} from '@1sat/actions';
import type { IndexedOutput } from '@1sat/types';
import { SWEEP_BATCH_SIZE } from '@1sat/sweep-ui';
import { PrivateKey } from '@bsv/sdk';
import type { Keys } from '../utils/keys';
import type { ScannedAssets } from './scanner';
import type { SweepSelection, SweepTxResult } from './types';

const normalizeOutpoint = (outpoint: string) => outpoint.replace('_', '.');

/** Canonical token listings only. */
export function isTokenLikeListing(output: IndexedOutput): boolean {
  const events = output.events ?? [];
  if (events.some((event) => event.startsWith('bsv21:') || event === 'type:application/bsv-20')) return true;
  const data = output.data as { bsv21?: unknown; insc?: { file?: { type?: string } } } | undefined;
  if (data?.bsv21 != null) return true;
  return data?.insc?.file?.type === 'application/bsv-20';
}

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

/** Cancel imported listings first, preserving native script validation, signing and OpNS routing. */
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
          `${label} (${offset + 1}–${offset + batch.length} of ${pending.length})`,
          batch,
          (inputs, inputKeys) => sweepOrdinals.execute(context, { inputs, keys: inputKeys }),
        ))
      )
        return false;
    }
    return true;
  };

  const listedTokens = assets.listings.filter(isTokenLikeListing);
  if (listedTokens.length) {
    onResult({
      type: 'ordinals',
      label: 'Cancel imported listings',
      error:
        'Listed tokens must be cancelled with a transfer inscription before sweeping. Use delist, not ordinal sweep.',
    });
    return;
  }
  if (!(await performOrdinalBatches('Cancel imported listings', assets.listings))) return;
  signal.throwIfAborted();

  const ordinals = [...assets.ordinals, ...assets.opnsNames].filter((output) =>
    selection.selectedOrdinals.has(output.outpoint),
  );
  await performOrdinalBatches('Ordinals / OpNS', ordinals);

  for (const token of assets.bsv21Tokens) {
    signal.throwIfAborted();
    if (!selection.selectedBsv21TokenIds.has(token.tokenId)) continue;
    await perform('bsv21', token.symbol || token.tokenId, token.outputs, (inputs, inputKeys) => {
      const amounts = new Map([...token.amounts].map(([outpoint, amount]) => [normalizeOutpoint(outpoint), amount]));
      return sweepBsv21.execute(context, {
        inputs: inputs.map((input) => {
          const amount = amounts.get(normalizeOutpoint(input.outpoint));
          if (amount === undefined) throw new Error('Token amount was not validated. Rescan before retrying.');
          return { ...input, tokenId: token.tokenId, amount };
        }),
        keys: inputKeys,
      });
    });
  }
  signal.throwIfAborted();
  if (selection.sweepBsv) {
    await perform('bsv', `BSV (${assets.totalBsv.toLocaleString()} sats)`, assets.funding, (inputs, inputKeys) =>
      sweepBsv.execute(context, { inputs, keys: inputKeys, amount: selection.bsvAmount }),
    );
  }
}
