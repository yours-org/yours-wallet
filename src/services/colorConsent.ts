/**
 * Consent for the 1Color (BRC-207) color module.
 *
 * The module asks the host on every token operation with a JSON message whose
 * `type` is `color_send`, `color_signature`, `color_access` (a read) or
 * `color_relinquish`, and keeps no grants of its own. This file turns each
 * message into a `PromptRequest` the extension's existing 1Sat prompt window
 * renders (`showOneSatPrompt`), and decides when an existing grant answers
 * without a prompt:
 *
 * - `color_access` for a basket: the same permission store the 1Sat modules'
 *   basket checks and the grouped-permission popup use. A stored basket grant
 *   for that app and that `p color` basket approves; an approved prompt stores one.
 * - the admin originator (the wallet's own background work) is approved without
 *   a prompt for `color_access` reads only, never for sends or signatures.
 */

import type {
  PromptDetailRow,
  PromptHandler,
  PromptPanel,
  PromptRequest,
  TransactionPrompt,
} from '@1sat/permission-module';
import { normalizeOriginator, type IPermissionStore } from '@1sat/wallet-browser';
import type { ColorTokenAccessHandler } from '@bsv/color-permission-module';

/* -------------------------------------------------------------------------
 * Message shapes (ColorPermissionModule.actionConsent / transactionConsent)
 * ---------------------------------------------------------------------- */

interface AssetLeg {
  assetId: string;
  operations: string[];
  inputAmount: string;
  foreignAmount: string;
  authorityInputs: number;
  foreignAuthorityInputs: number;
  keptAmount: string;
  keptAuthorities: number;
  outgoingAmount: string;
  outgoingAuthorities: number;
  transferred: string;
  burned: string;
  minted: string;
}

interface Destination {
  outputIndex: number;
  satoshis: number;
  lockingScript: string;
  assetId?: string;
  role?: string;
  amount?: string;
}

interface ReleasedSignature {
  outpoint: string;
  inputIndex: number;
  sighashType: number;
}

interface TransactionFacts {
  deploy?: { operation: string; amount: string; owned: boolean };
  assets: AssetLeg[];
  destinations: Destination[];
  satoshis: { inputs: number; outputs: number; fee: number };
  signatures: ReleasedSignature[];
  lockTime: number;
}

export type ColorSendMessage = TransactionFacts & { type: 'color_send'; handoff: boolean };
export type ColorSignatureMessage = TransactionFacts & { type: 'color_signature'; inputIndex: number };
export interface ColorAccessMessage {
  type: 'color_access';
  basket?: string;
  assetId?: string;
  role?: string;
  labels?: string[];
  seekPermission?: boolean;
}
export interface ColorRelinquishMessage {
  type: 'color_relinquish';
  assetId: string;
  role: string;
  outpoint: string;
}
export type ColorMessage = ColorSendMessage | ColorSignatureMessage | ColorAccessMessage | ColorRelinquishMessage;

/* -------------------------------------------------------------------------
 * Display helpers
 * ---------------------------------------------------------------------- */

const short = (value: string, head = 8, tail = 6): string =>
  value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

const sats = (n: number): string => `${n.toLocaleString('en-US')} sats`;

/** `0x41 ALL|FORKID` style name for a sighash type byte. */
export const sighashName = (type: number): string => {
  const base = ({ 1: 'ALL', 2: 'NONE', 3: 'SINGLE' } as Record<number, string>)[type & 0x1f] ?? 'UNKNOWN';
  const flags = [base, ...(type & 0x40 ? ['FORKID'] : []), ...(type & 0x80 ? ['ANYONECANPAY'] : [])];
  return `0x${type.toString(16).padStart(2, '0')} ${flags.join('|')}`;
};

const authorities = (n: number): string => (n === 0 ? '' : ` + ${n} authorit${n === 1 ? 'y' : 'ies'}`);

const assetPanel = (leg: AssetLeg): PromptPanel => ({
  title: `Token ${short(leg.assetId)}`,
  subtitle: leg.operations.join(', '),
  variant: 'token',
  tone: leg.burned !== '0' ? 'danger' : 'default',
  meta: [
    { key: 'Asset', value: short(leg.assetId), copyValue: leg.assetId },
    { key: 'Your inputs', value: `${leg.inputAmount}${authorities(leg.authorityInputs)}` },
    { key: 'Other inputs', value: `${leg.foreignAmount}${authorities(leg.foreignAuthorityInputs)}` },
    { key: 'Kept', value: `${leg.keptAmount}${authorities(leg.keptAuthorities)}` },
    { key: 'Outgoing', value: `${leg.outgoingAmount}${authorities(leg.outgoingAuthorities)}` },
    { key: 'Transferred', value: leg.transferred },
    { key: 'Minted', value: leg.minted },
    { key: 'Burned', value: leg.burned },
  ],
});

const deployPanel = (deploy: NonNullable<TransactionFacts['deploy']>): PromptPanel => ({
  title: 'New token deploy',
  subtitle: deploy.operation,
  variant: 'token',
  meta: [
    { key: 'Amount', value: deploy.amount },
    { key: 'Kept by this wallet', value: deploy.owned ? 'Yes' : 'No' },
  ],
});

const destinationPanel = (out: Destination): PromptPanel => {
  const script: PromptDetailRow = {
    key: 'Script',
    value: short(out.lockingScript, 12, 8),
    copyValue: out.lockingScript,
  };
  if (out.assetId === undefined) {
    return {
      title: `Output #${out.outputIndex}`,
      subtitle: sats(out.satoshis),
      variant: 'value',
      valueIcon: 'pay',
      amountSats: out.satoshis,
      meta: [script],
    };
  }
  return {
    title: `Output #${out.outputIndex}`,
    subtitle: out.role === 'authority' ? 'Authority' : `${out.amount ?? '0'} tokens`,
    variant: 'token',
    meta: [
      { key: 'Asset', value: short(out.assetId), copyValue: out.assetId },
      ...(out.role ? [{ key: 'Role', value: out.role }] : []),
      { key: 'Satoshis', value: sats(out.satoshis) },
      script,
    ],
  };
};

const transactionPrompt = (
  title: string,
  originator: string,
  facts: TransactionFacts,
  extraRows: PromptDetailRow[],
): TransactionPrompt => ({
  title,
  subtitle: originator,
  panels: [
    ...(facts.deploy ? [deployPanel(facts.deploy)] : []),
    ...facts.assets.map(assetPanel),
    ...facts.destinations.map(destinationPanel),
  ],
  rows: [
    ...extraRows,
    { key: 'Inputs', value: sats(facts.satoshis.inputs) },
    { key: 'Outputs', value: sats(facts.satoshis.outputs) },
    { key: 'Fee', value: sats(facts.satoshis.fee) },
    ...facts.signatures.map((sig) => ({
      key: `Signs input #${sig.inputIndex}`,
      value: `${short(sig.outpoint, 8, 4)} · ${sighashName(sig.sighashType)}`,
      copyValue: sig.outpoint,
    })),
    { key: 'Lock time', value: String(facts.lockTime) },
  ],
});

const accessDescription = (msg: ColorAccessMessage): { scope: string; description: string } => {
  if (msg.basket === undefined) return { scope: 'token history', description: 'View token action history' };
  if (msg.assetId === undefined) return { scope: 'all tokens', description: 'List every token this wallet holds' };
  const role = msg.role === 'authority' ? 'authority' : 'value';
  return /^p color balance /.test(msg.basket)
    ? { scope: 'token balance', description: `View the ${role} balance of this token` }
    : { scope: 'token outputs', description: `View the ${role} outputs of this token` };
};

/* -------------------------------------------------------------------------
 * Message → PromptRequest
 * ---------------------------------------------------------------------- */

/**
 * The prompt for one color module message. Send and signature consents use the
 * transaction layout (`kind: 'transaction'`), because the prompt window only
 * renders panels for that kind; a read uses `basketAccess`; a relinquish uses
 * the transaction layout for its own title (the basketAccess layout would title
 * it "Grant Item View").
 */
export const colorPromptRequest = (app: string, msg: ColorMessage): PromptRequest => {
  switch (msg.type) {
    case 'color_send': {
      const payload = transactionPrompt(
        msg.handoff ? 'Token Handoff' : 'Token Transaction',
        app,
        msg,
        msg.handoff ? [{ key: 'Handoff', value: 'Signed now, sent by the receiver' }] : [],
      );
      return {
        kind: 'transaction',
        originator: app,
        summary: `${msg.handoff ? 'Hand off' : 'Send'} ${msg.assets.length} token leg${msg.assets.length === 1 ? '' : 's'}`,
        payload: payload as unknown as Record<string, unknown>,
      };
    }
    case 'color_signature': {
      const payload = transactionPrompt('Token Signature', app, msg, [
        { key: 'Signs input', value: `#${msg.inputIndex}` },
      ]);
      return {
        kind: 'transaction',
        originator: app,
        summary: `Sign token input #${msg.inputIndex} of an app-built transaction`,
        payload: payload as unknown as Record<string, unknown>,
      };
    }
    case 'color_access': {
      const { scope, description } = accessDescription(msg);
      const keys = msg.basket !== undefined ? [msg.basket] : (msg.labels ?? []);
      return {
        kind: 'basketAccess',
        originator: app,
        summary: keys.length === 1 ? `Grant view to ${keys[0]}` : `Grant view to ${keys.length} token labels`,
        payload: {
          baskets: keys.map((basket) => ({
            basket,
            scope,
            description,
            ...(msg.assetId ? { value: msg.assetId } : {}),
          })),
        },
      };
    }
    case 'color_relinquish': {
      const payload: TransactionPrompt = {
        title: 'Remove Token Output',
        subtitle: app,
        panels: [
          {
            title: `Token ${short(msg.assetId)}`,
            subtitle: `${msg.role} output`,
            variant: 'token',
            tone: 'danger',
            meta: [
              { key: 'Asset', value: short(msg.assetId), copyValue: msg.assetId },
              { key: 'Output', value: short(msg.outpoint, 8, 4), copyValue: msg.outpoint },
            ],
          },
        ],
        rows: [{ key: 'Effect', value: 'The wallet stops tracking this output; the coins are not spent' }],
      };
      return {
        kind: 'transaction',
        originator: app,
        summary: `Remove token output ${msg.outpoint} from the wallet`,
        payload: payload as unknown as Record<string, unknown>,
      };
    }
  }
};

/* -------------------------------------------------------------------------
 * requestTokenAccess
 * ---------------------------------------------------------------------- */

export interface ColorTokenAccessOptions {
  promptHandler: PromptHandler;
  permissionStore: IPermissionStore;
  adminOriginator: string;
}

const isExpired = (expiry: number): boolean => !!expiry && expiry < Math.floor(Date.now() / 1000);

const KNOWN_TYPES = new Set(['color_send', 'color_signature', 'color_access', 'color_relinquish']);

export const createColorTokenAccessHandler = (options: ColorTokenAccessOptions): ColorTokenAccessHandler => {
  const { promptHandler, permissionStore, adminOriginator } = options;
  const adminNormalized = normalizeOriginator(adminOriginator);

  return async (app: string, message: string): Promise<boolean> => {
    let msg: ColorMessage;
    try {
      msg = JSON.parse(message) as ColorMessage;
    } catch {
      console.error('[colorConsent] unreadable color module request; declined');
      return false;
    }
    if (!msg || typeof msg !== 'object' || !KNOWN_TYPES.has(msg.type)) {
      console.error('[colorConsent] unknown color module request type; declined', msg?.type);
      return false;
    }

    const originator = normalizeOriginator(app);
    const isAdmin = app === adminOriginator || originator === adminNormalized;

    if (msg.type === 'color_access') {
      if (isAdmin) return true;
      // A basket read is covered by a stored basket grant; label reads (listActions)
      // have no grant shape in the store and prompt every time.
      const basket = msg.basket?.trim().toLowerCase();
      if (basket) {
        const grant = await permissionStore.findGrant({ type: 'basket', originator, basket });
        if (grant && !isExpired(grant.expiry)) return true;
      }
      if (msg.seekPermission === false) return false;
      const approved = await promptHandler(colorPromptRequest(app, msg));
      if (approved && basket) {
        await permissionStore.putGrant({
          key: { type: 'basket', originator, basket },
          expiry: 0,
          grantedAt: Date.now(),
        });
      }
      return approved;
    }

    return await promptHandler(colorPromptRequest(app, msg));
  };
};
