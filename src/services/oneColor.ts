/**
 * 1Color (BRC-162) tokens the wallet holds, for the popup's token list and
 * send view.
 *
 * Holdings come from the BRC-207 color module's `p color assets` view: one
 * `listOutputs` per page over every per-asset basket, each output tagged
 * `color_state_available` or `color_state_reserved` (an input of a pending
 * action). The output's locking script is decoded with the OneColor template
 * for its asset, role and amount; the view reports wallet state only and
 * never asks the overlay.
 *
 * Symbol, decimals and icon live on the asset's deploy output alone, so they
 * are read once per asset from the deploy transaction (`<txid>` of the asset
 * id) and cached for the popup's lifetime.
 */
import {
  LockingScript,
  Transaction,
  Utils,
  type WalletAction,
  type WalletInterface,
  type WalletOutput,
} from '@bsv/sdk';
import { OneColor, type OneColorMetadata, type OneColorToken } from '@1sat/templates';
import { ASSETS_SELECTOR } from '@bsv/color-permission-module';
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
  /** Value units spendable now. */
  available: bigint;
  /** Value units held by a pending action (a send not yet settled). */
  reserved: bigint;
  /** Authority outputs held (available + reserved). */
  authorities: number;
};

const STATE_RESERVED = 'color_state_reserved';
const COLOR_BASKET_PREFIX = 'p color ';

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

type HoldingOutput = Pick<WalletOutput, 'lockingScript' | 'tags'>;

/** Group decoded token outputs by asset: amounts by state, authority count. */
export const aggregateOneColorHoldings = (
  outputs: HoldingOutput[],
): Map<string, Pick<OneColorBalance, 'assetId' | 'available' | 'reserved' | 'authorities'>> => {
  const byAsset = new Map<string, Pick<OneColorBalance, 'assetId' | 'available' | 'reserved' | 'authorities'>>();
  for (const o of outputs) {
    const token = decodeOneColor(o.lockingScript);
    if (!token?.tokenId || token.role === 'deploy') continue;
    const reserved = (o.tags ?? []).includes(STATE_RESERVED);
    const entry = byAsset.get(token.tokenId) ?? {
      assetId: token.tokenId,
      available: 0n,
      reserved: 0n,
      authorities: 0,
    };
    if (token.role === 'authority') entry.authorities += 1;
    else if (reserved) entry.reserved += token.amount;
    else entry.available += token.amount;
    byAsset.set(token.tokenId, entry);
  }
  return byAsset;
};

/** Every token output the color module holds, across all assets. */
export const listOneColorHoldings = async (wallet: WalletInterface): Promise<HoldingOutput[]> => {
  const outputs: HoldingOutput[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await wallet.listOutputs({
      basket: ASSETS_SELECTOR,
      include: 'locking scripts',
      includeTags: true,
      limit: PAGE,
      offset,
    });
    outputs.push(...page.outputs);
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
  const holdings = aggregateOneColorHoldings(await listOneColorHoldings(ctx.wallet));
  return Promise.all(
    [...holdings.values()].map(async (h) => {
      let info: OneColorAssetInfo = { dec: 0 };
      try {
        info = await getOneColorAssetInfo(ctx, h.assetId);
      } catch (error) {
        console.error(`[oneColor] deploy of ${h.assetId} not readable:`, error);
      }
      return { ...h, ...info };
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
 * `p color` basket are this wallet's; any other value output of the asset
 * went to someone else. A deploy at this action's own outpoint counts as the
 * asset arriving. `null` when the action touches no output of the asset.
 */
export const oneColorActionAmount = (action: WalletAction, assetId: string): OneColorActionAmount | null => {
  let toOthers = 0n;
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
    else toOthers += t.amount;
  }
  for (const i of action.inputs ?? []) {
    const t = decodeOneColor(i.sourceLockingScript);
    if (t?.tokenId !== assetId) continue;
    involved = true;
    if (t.role === 'value') fromUs += t.amount;
  }
  if (!involved) return null;
  if (toOthers > 0n) return { direction: 'sent', amount: toOthers };
  if (fromUs === 0n && toUs > 0n) return { direction: 'received', amount: toUs };
  if (fromUs > toUs) return { direction: 'sent', amount: fromUs - toUs };
  return { direction: 'transfer', amount: 0n };
};
