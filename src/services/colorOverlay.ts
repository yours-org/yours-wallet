/**
 * The 1Color (BRC-207) overlay provider handed to `@bsv/color-permission-module`.
 *
 * The module asks it three things: submit a signed token transaction to its
 * topics (BRC-22), and which outputs of an asset are admitted and unspent
 * (`color-spendability`) or were ever admitted (`color-admission`) (BRC-24).
 *
 * Each asset resolves to one overlay origin: the user's per-token override
 * (Settings > Token overlays) first, else the chain's build-time default. No
 * origin is an error, so the module fails closed for that asset; it never gets
 * an empty answer it could read as "nothing admitted".
 */

import { HTTPSOverlayLookupFacilitator, Transaction } from '@bsv/sdk';
import type { LookupAnswer, LookupQuestion, STEAK } from '@bsv/sdk';
import type { ColorOverlayProvider } from '@bsv/color-permission-module';
import { OverlayClient } from '@1sat/client';
import type { ColorOverlayOverride } from './types/chromeStorage.types';

/** The discovery topic a deploy is submitted to. */
export const COLOR_DISCOVERY_TOPIC = 'tm_color';
const ASSET_TOPIC_PREFIX = 'tm_color_';

/** Overlay lookups answer from a remote host; the SDK's 2s default is too tight for it. */
const LOOKUP_TIMEOUT_MS = 15_000;

const ASSET_ID = /^[0-9a-f]{64}_\d+$/;

export const isColorAssetId = (value: string): boolean => ASSET_ID.test(value);

/**
 * Reduce a user-entered overlay URL to its origin, or undefined when it is not
 * an https URL. The facilitators address `/submit` and `/lookup` at the origin root.
 */
export const normalizeOverlayOrigin = (value: string): string | undefined => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

export interface ColorOverlayProviderOptions {
  /** The chain's default origin, or undefined when the chain has none. */
  defaultOrigin?: string;
  /** The current per-token overrides; read on every call so Settings edits apply at once. */
  getOverrides: () => Promise<ColorOverlayOverride[]>;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export class NoColorOverlayError extends Error {
  constructor(readonly assetId: string) {
    super(
      `No 1Color overlay is configured for token ${assetId} on this network. Add one in Settings > Token overlays.`,
    );
    this.name = 'NoColorOverlayError';
  }
}

export interface ColorOverlayResolver {
  /** The overlay origin for an asset; throws NoColorOverlayError when there is none. */
  resolveOrigin: (assetId: string) => Promise<string>;
}

export const createColorOverlayProvider = (
  options: ColorOverlayProviderOptions,
): ColorOverlayProvider & ColorOverlayResolver => {
  const fetchFn: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const lookup = new HTTPSOverlayLookupFacilitator(fetchFn);

  const resolveOrigin = async (assetId: string): Promise<string> => {
    const overrides = await options.getOverrides();
    const override = overrides.find((entry) => entry.assetId === assetId);
    const origin = override?.origin ?? options.defaultOrigin;
    if (!origin) throw new NoColorOverlayError(assetId);
    return origin;
  };

  const query = async (
    assetId: string,
    type: 'color-spendability' | 'color-admission',
    outpoints: string[],
  ): Promise<LookupAnswer> => {
    const origin = await resolveOrigin(assetId);
    const question: LookupQuestion = {
      service: `ls_color_${assetId}`,
      query: { type, version: 1, assetId, topic: `${ASSET_TOPIC_PREFIX}${assetId}`, outpoints },
    };
    const answer = await lookup.lookup(origin, question, LOOKUP_TIMEOUT_MS);
    if (answer.type !== 'output-list') {
      throw new Error(`1Color overlay ${origin} answered ${type} with a ${answer.type} answer`);
    }
    return answer;
  };

  /**
   * One submission per overlay: asset topics go to their asset's origin; the
   * deploy discovery topic goes with the origin of the asset the deploy creates
   * (`<txid>_0`), which is the chain default unless an override names it.
   */
  const submit = async (topics: string[], beef: number[]): Promise<STEAK> => {
    const byOrigin = new Map<string, string[]>();
    const add = (origin: string, topic: string) => byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), topic]);
    for (const topic of topics) {
      if (topic.startsWith(ASSET_TOPIC_PREFIX)) {
        add(await resolveOrigin(topic.slice(ASSET_TOPIC_PREFIX.length)), topic);
      } else if (topic === COLOR_DISCOVERY_TOPIC) {
        const deployId = `${Transaction.fromAtomicBEEF(beef).id('hex')}_0`;
        add(await resolveOrigin(deployId), topic);
      } else {
        throw new Error(`1Color overlay provider: unexpected topic ${topic}`);
      }
    }
    const steak: STEAK = {};
    for (const [origin, originTopics] of byOrigin) {
      const client = new OverlayClient(origin, { fetch: fetchFn });
      Object.assign(steak, await client.submitBrc22(beef, originTopics));
    }
    return steak;
  };

  return {
    resolveOrigin,
    submit,
    spendability: (assetId, outpoints) => query(assetId, 'color-spendability', outpoints),
    admission: (assetId, outpoints) => query(assetId, 'color-admission', outpoints),
  };
};
