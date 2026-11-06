/**
 * 1Color (BRC-162) tokens the wallet holds, for the popup's token list and
 * send view.
 *
 * Holdings come from the BRC-207 color module's `p color assets` view: one
 * `listOutputs` per page over every per-asset basket, each output tagged
 * `color_state_available` or `color_state_reserved`. The output's locking
 * script is decoded with the OneColor template for its asset, role and
 * amount; the view reports wallet state only and never asks the overlay.
 *
 * `reserved` is the module's word for "not spendable": the output is an input
 * of an action that has not been proven yet. That covers two very different
 * things. A handoff (`nosend`) is signed but unsent, so its tokens are still
 * ours until the recipient claims it or it expires: those are *pending*. A
 * broadcast transaction (`unproven`, `sending`) has already spent its inputs
 * and its change is listed as available, so counting those inputs would
 * count the same tokens twice. The balance here is `available`, and
 * `pending` is the reserved amount held by unsent actions, found by looking
 * each reserved outpoint up in the action history.
 *
 * Symbol, decimals and icon live on the asset's deploy output alone, so they
 * are read once per asset from the deploy transaction (`<txid>` of the asset
 * id) and cached for the popup's lifetime.
 */
import {
  LockingScript,
  Transaction,
  Utils,
  type ActionStatus,
  type WalletAction,
  type WalletInterface,
  type WalletOutput,
} from '@bsv/sdk';
import { OneColor, type OneColorMetadata, type OneColorToken } from '@1sat/templates';
import { sdk } from '@bsv/wallet-toolbox-client';
import type { OneSatContext } from '@1sat/actions';

export type OneColorAssetInfo = {
  /** Ticker, not unique; absent when the deploy carries none. */
  sym?: string;
  /** Decimal places, 0-18. */
  dec: number;
  /** The deploy's embedded icon as a data URL, when it has one of a sane size. */
  icon?: string;
};

export type OneColorBalance = OneColorAssetInfo & {
  /** `<txid>_<vout>` */
  assetId: string;
  /** Value units spendable now: the balance. */
  available: bigint;
  /** Value units held by unsent sends (handoffs the recipient has not claimed); not part of the balance. */
  pending: bigint;
  /** Authority outputs held (available + reserved). */
  authorities: number;
};

/** A value output the module reports as reserved, with what it is worth. */
export type ReservedOutput = { outpoint: string; amount: bigint };

export type OneColorHolding = {
  assetId: string;
  available: bigint;
  reservedOutputs: ReservedOutput[];
  authorities: number;
};

const STATE_RESERVED = 'color_state_reserved';
const STATE_AVAILABLE = 'color_state_available';
const COLOR_BASKET_PREFIX = 'p color ';

/** Action statuses whose inputs are still the wallet's: signed or built, but not broadcast. */
const UNSENT_STATUSES: ReadonlySet<ActionStatus> = new Set(['nosend', 'unsigned', 'nonfinal']);

/** Decode a locking script as a 1Color output; null for anything else, including bad hex. */
export const decodeOneColor = (lockingScriptHex: string | undefined): OneColorToken | null => {
  if (!lockingScriptHex) return null;
  try {
    return OneColor.decode(LockingScript.fromHex(lockingScriptHex));
  } catch {
    return null;
  }
};

/** What the lists call a token: its symbol, else a short asset id. */
export const oneColorTicker = (t: { sym?: string; assetId: string }): string =>
  t.sym || `${t.assetId.slice(0, 6)}…${t.assetId.slice(-4)}`;
const PAGE = 1000;

type HoldingOutput = Pick<WalletOutput, 'outpoint' | 'lockingScript' | 'tags'>;

/**
 * The asset an output belongs to. A deploy output carries no asset id in its
 * script: it is the asset, `<txid>_0`, and a fixed-supply deploy is also the
 * holder's first value output (an authority deploy, amount 0, its first
 * authority output). The module files it in the asset's basket like any other.
 */
const assetIdOf = (token: OneColorToken, outpoint: string): string | undefined =>
  token.tokenId ?? (token.role === 'deploy' ? `${outpoint.split('.')[0]}_0` : undefined);

/** Group decoded token outputs by asset: available amount, reserved outputs, authority count. */
export const aggregateOneColorHoldings = (outputs: HoldingOutput[]): Map<string, OneColorHolding> => {
  const byAsset = new Map<string, OneColorHolding>();
  for (const o of outputs) {
    const token = decodeOneColor(o.lockingScript);
    const assetId = token && assetIdOf(token, o.outpoint);
    if (!token || !assetId) continue;
    const reserved = (o.tags ?? []).includes(STATE_RESERVED);
    const entry = byAsset.get(assetId) ?? { assetId, available: 0n, reservedOutputs: [], authorities: 0 };
    const authority = token.role === 'authority' || (token.role === 'deploy' && token.amount === 0n);
    if (authority) entry.authorities += 1;
    else if (reserved) entry.reservedOutputs.push({ outpoint: o.outpoint, amount: token.amount });
    else entry.available += token.amount;
    byAsset.set(assetId, entry);
  }
  return byAsset;
};

const STATUS_SCAN_PAGE = 100;
const STATUS_SCAN_MAX = 2000;

/**
 * The status of the action spending each outpoint, from the action history
 * newest first (reserved inputs belong to recent actions). Stops as soon as
 * every outpoint is found, or after `STATUS_SCAN_MAX` actions.
 */
export const findSpendingStatuses = async (
  wallet: Pick<WalletInterface, 'listActions'>,
  outpoints: Iterable<string>,
): Promise<Map<string, ActionStatus>> => {
  const wanted = new Set(outpoints);
  const found = new Map<string, ActionStatus>();
  if (wanted.size === 0) return found;
  const probe = await wallet.listActions({ labels: [], limit: 1, offset: 0 });
  let end = probe.totalActions;
  let scanned = 0;
  while (end > 0 && found.size < wanted.size && scanned < STATUS_SCAN_MAX) {
    const start = Math.max(0, end - STATUS_SCAN_PAGE);
    const { actions } = await wallet.listActions({
      labels: [],
      includeInputs: true,
      limit: end - start,
      offset: start,
    });
    for (const a of actions) {
      for (const i of a.inputs ?? []) {
        if (wanted.has(i.sourceOutpoint) && !found.has(i.sourceOutpoint)) found.set(i.sourceOutpoint, a.status);
      }
    }
    scanned += end - start;
    end = start;
  }
  return found;
};

/**
 * The reserved amount still the wallet's: inputs of unsent actions. An
 * outpoint whose spender was not found in the scanned history is treated as
 * pending rather than spent, the side that never hides tokens.
 */
export const pendingAmount = (reserved: ReservedOutput[], statuses: Map<string, ActionStatus>): bigint =>
  reserved.reduce((sum, r) => {
    const status = statuses.get(r.outpoint);
    return status === undefined || UNSENT_STATUSES.has(status) ? sum + r.amount : sum;
  }, 0n);

/**
 * Every token output the color module holds, across all assets.
 *
 * Read from the toolbox's basket-prefix listing directly, not the module's
 * `p color assets` selector. The module asks the toolbox for that listing
 * without a page size, and the toolbox's action-batch overlay slices every
 * result to the default ten outputs, so the selector never shows more than
 * the first ten token outputs by txid (color-permission-module 0.1.3 on
 * wallet-toolbox-client 2.15.3). The state tag is derived the way the
 * module derives it: an output that is not spendable is reserved.
 */
export const listOneColorHoldings = async (wallet: Pick<WalletInterface, 'listOutputs'>): Promise<HoldingOutput[]> => {
  const outputs: HoldingOutput[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await wallet.listOutputs({
      basket: sdk.specOpBasketPrefixOutputs,
      tags: [COLOR_BASKET_PREFIX.trim()],
      include: 'locking scripts',
      includeTags: true,
      limit: PAGE,
      offset,
    });
    outputs.push(
      ...page.outputs.map((o) => ({
        outpoint: o.outpoint,
        lockingScript: o.lockingScript,
        tags: [...(o.tags ?? []), o.spendable ? STATE_AVAILABLE : STATE_RESERVED],
      })),
    );
    if (page.outputs.length < PAGE || outputs.length >= Number(page.totalOutputs)) break;
  }
  return outputs;
};

/** The deploy's display fields as the list shows them. */
export const assetInfoFromMetadata = (meta: OneColorMetadata | undefined): OneColorAssetInfo => {
  const info: OneColorAssetInfo = { dec: meta?.dec ?? 0 };
  if (meta?.sym) info.sym = meta.sym;
  const icon = meta?.icon;
  if (icon && icon.bytes.length > 0 && /^image\//.test(icon.mediaType)) {
    info.icon = `data:${icon.mediaType};base64,${Utils.toBase64(Array.from(icon.bytes))}`;
  }
  return info;
};

const assetInfoCache = new Map<string, Promise<OneColorAssetInfo>>();

/**
 * Symbol, decimals and icon for an asset, read from its deploy output. A
 * deploy that cannot be fetched or decoded yields the bare default (0
 * decimals, no symbol) and is not cached, so the next listing retries.
 */
export const getOneColorAssetInfo = (ctx: OneSatContext, assetId: string): Promise<OneColorAssetInfo> => {
  let p = assetInfoCache.get(assetId);
  if (!p) {
    p = (async () => {
      const [txid, voutText] = assetId.split('_');
      const vout = Number(voutText);
      if (!ctx.services || !/^[0-9a-f]{64}$/.test(txid) || !Number.isInteger(vout)) return { dec: 0 };
      const raw = await ctx.services.beef.getRawTx(txid);
      const tx = Transaction.fromBinary(Array.from(raw));
      const token = OneColor.decode(tx.outputs[vout]?.lockingScript ?? LockingScript.fromHex(''));
      if (!token || token.role !== 'deploy') throw new Error(`${assetId}: output is not a 1Color deploy`);
      return assetInfoFromMetadata(token.metadata);
    })();
    p.catch(() => assetInfoCache.delete(assetId));
    assetInfoCache.set(assetId, p);
  }
  return p;
};

/** The wallet's 1Color balances, one per asset held, with display fields. */
export const getOneColorBalances = async (ctx: OneSatContext): Promise<OneColorBalance[]> => {
  const holdings = [...aggregateOneColorHoldings(await listOneColorHoldings(ctx.wallet)).values()];
  const statuses = await findSpendingStatuses(
    ctx.wallet,
    holdings.flatMap((h) => h.reservedOutputs.map((r) => r.outpoint)),
  );
  return Promise.all(
    holdings.map(async ({ reservedOutputs, ...h }) => {
      let info: OneColorAssetInfo = { dec: 0 };
      try {
        info = await getOneColorAssetInfo(ctx, h.assetId);
      } catch (error) {
        console.error(`[oneColor] deploy of ${h.assetId} not readable:`, error);
      }
      return { ...h, pending: pendingAmount(reservedOutputs, statuses), ...info };
    }),
  );
};

/** `@handle@domain` from what the user typed, or null when it is not a BRC-169 handle. */
export const normalizeHandle = (input: string): string | null => {
  const m = /^@?([^@\s]+)@([^@\s]+)$/.exec(input.trim());
  return m ? `@${m[1]}@${m[2]}` : null;
};

export type OneColorActionAmount = { direction: 'sent' | 'received' | 'transfer'; amount: bigint };

/**
 * What one wallet action did with an asset, from its decoded inputs and
 * outputs (`listActions` with locking scripts). Value outputs filed in a
 * `p color` basket are this wallet's. Inputs are this wallet's when their
 * lock is P2PKH: the module only ever holds tokens behind P2PKH, while a
 * covenant such as an AMM pool is somebody else's output even though this
 * wallet may have signed the transaction (an LP close, a swap). The amount
 * is the net of what came to us and what left us; outputs to others are not
 * counted, so a swap's pool continuation does not read as a send. A deploy at
 * this action's own outpoint counts as the asset arriving. `null` when the
 * action touches no output of the asset.
 */
export const oneColorActionAmount = (action: WalletAction, assetId: string): OneColorActionAmount | null => {
  let toUs = 0n;
  let fromUs = 0n;
  let involved = false;
  for (const o of action.outputs ?? []) {
    const t = decodeOneColor(o.lockingScript);
    if (!t) continue;
    const id = t.tokenId ?? (t.role === 'deploy' ? `${action.txid}_${o.outputIndex}` : undefined);
    if (id !== assetId) continue;
    involved = true;
    if (t.role === 'authority') continue;
    if (o.basket?.startsWith(COLOR_BASKET_PREFIX)) toUs += t.amount;
  }
  for (const i of action.inputs ?? []) {
    const t = decodeOneColor(i.sourceLockingScript);
    if (t?.tokenId !== assetId) continue;
    involved = true;
    if (t.role === 'value' && isP2pkh(t.lock)) fromUs += t.amount;
  }
  if (!involved) return null;
  const net = toUs - fromUs;
  if (net > 0n) return { direction: 'received', amount: net };
  if (net < 0n) return { direction: 'sent', amount: -net };
  return { direction: 'transfer', amount: 0n };
};

/** OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG, and nothing else. */
const isP2pkh = (lock: LockingScript): boolean => {
  const c = lock.chunks;
  return (
    c.length === 5 &&
    c[0].op === 0x76 &&
    c[1].op === 0xa9 &&
    c[2].data?.length === 20 &&
    c[3].op === 0x88 &&
    c[4].op === 0xac
  );
};
