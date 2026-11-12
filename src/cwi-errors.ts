import { WERR_INSUFFICIENT_FUNDS, WERR_INVALID_PARAMETER, WERR_REVIEW_ACTIONS } from '@bsv/sdk';

type ReviewActionPayload = Pick<
  WERR_REVIEW_ACTIONS,
  'reviewActionResults' | 'sendWithResults' | 'txid' | 'tx' | 'noSendChange'
>;

/** JSON-safe BRC-100 errors shared by the extension's three message realms. */
export interface CwiErrorEnvelope extends Partial<ReviewActionPayload> {
  status: 'error';
  code: string;
  description: string;
  name: string;
  message: string;
  context?: unknown;
  parameter?: string;
  totalSatoshisNeeded?: number;
  moreSatoshisNeeded?: number;
  cleanupFailure?: {
    operation: 'abortAction';
    status: 'unconfirmed';
    reference: string;
    message: string;
  };
}

export function serializeCwiError(error: unknown): CwiErrorEnvelope {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const message =
    typeof value?.message === 'string' ? value.message : typeof error === 'string' ? error : 'Unknown wallet error';
  // SDK constructors derive name from constructor.name, which Vite minifies.
  // Identify the imported classes before assigning stable public wire names.
  const name =
    error instanceof WERR_REVIEW_ACTIONS
      ? 'WERR_REVIEW_ACTIONS'
      : error instanceof WERR_INVALID_PARAMETER
        ? 'WERR_INVALID_PARAMETER'
        : error instanceof WERR_INSUFFICIENT_FUNDS
          ? 'WERR_INSUFFICIENT_FUNDS'
          : typeof value?.name === 'string'
            ? value.name
            : 'Error';
  const candidate = typeof value?.code === 'string' ? value.code : name;
  const code = /^[A-Za-z][A-Za-z0-9_-]{9,39}$/.test(candidate) ? candidate : 'ERR_WALLET_FAILURE';
  let description = typeof value?.description === 'string' ? value.description : message;
  if (new TextEncoder().encode(description).length < 20) description = `Wallet request failed: ${description}`;
  // Bound the public description in UTF-8 bytes, without splitting a code point.
  let bounded = '';
  for (const char of description) {
    if (new TextEncoder().encode(bounded + char).length > 200) break;
    bounded += char;
  }
  const envelope: CwiErrorEnvelope = { status: 'error', code, description: bounded, name, message };
  // Only explicitly public context crosses the boundary; stack/cause and other
  // implementation properties are never copied onto the wire.
  if (value?.context !== undefined) {
    try {
      const encoded = JSON.stringify(value.context);
      if (encoded !== undefined && encoded.length <= 16_384) envelope.context = JSON.parse(encoded);
    } catch {
      // Circular or non-JSON context cannot cross Chrome's message channel.
    }
  }
  // These documented recovery results are public output from an undelayed
  // createAction/signAction failure. Preserve them without copying arbitrary
  // Error properties or imposing the small contextual-message size limit.
  if (name === 'WERR_REVIEW_ACTIONS') {
    for (const key of ['reviewActionResults', 'sendWithResults', 'txid', 'tx', 'noSendChange'] as const) {
      if (value?.[key] === undefined) continue;
      try {
        const encoded = JSON.stringify(value[key]);
        if (encoded !== undefined) Object.assign(envelope, { [key]: JSON.parse(encoded) });
      } catch {
        // Non-JSON payloads cannot be transferred by Chrome.
      }
    }
  }
  if (name === 'WERR_INVALID_PARAMETER' && typeof value?.parameter === 'string') envelope.parameter = value.parameter;
  if (name === 'WERR_INSUFFICIENT_FUNDS') {
    if (typeof value?.totalSatoshisNeeded === 'number') envelope.totalSatoshisNeeded = value.totalSatoshisNeeded;
    if (typeof value?.moreSatoshisNeeded === 'number') envelope.moreSatoshisNeeded = value.moreSatoshisNeeded;
  }
  // Failed cleanup is secondary to the operation's original structured error.
  // Copy only the declared public receipt, never an Error's stack or cause.
  const cleanup = value?.cleanupFailure as Partial<NonNullable<CwiErrorEnvelope['cleanupFailure']>> | undefined;
  if (
    cleanup?.operation === 'abortAction' &&
    cleanup.status === 'unconfirmed' &&
    typeof cleanup.reference === 'string' &&
    typeof cleanup.message === 'string'
  ) {
    envelope.cleanupFailure = {
      operation: 'abortAction',
      status: 'unconfirmed',
      reference: cleanup.reference,
      message: cleanup.message,
    };
  }
  return envelope;
}

export function cwiFailure(error: unknown) {
  const walletError = serializeCwiError(error);
  return { error: walletError.message, walletError };
}

export function reviveCwiError(envelope: unknown, fallback?: unknown): Error & CwiErrorEnvelope {
  const candidate = envelope && typeof envelope === 'object' ? (envelope as Partial<CwiErrorEnvelope>) : undefined;
  const fields =
    candidate?.status === 'error' &&
    typeof candidate.code === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.message === 'string'
      ? serializeCwiError(candidate)
      : serializeCwiError(fallback);
  return Object.assign(new Error(fields.message), fields);
}
