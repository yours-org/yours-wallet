/**
 * CWI (Chrome Wallet Interface) - BRC-100 WalletInterface implementation
 * Bridges to the 1sat wallet via postMessage/CustomEvent pattern
 */

import { CustomListenerName } from './inject';

// BRC-100 Event Names
export enum CWIEventName {
  // Read-only operations
  LIST_OUTPUTS = 'cwi_listOutputs',
  LIST_ACTIONS = 'cwi_listActions',
  GET_PUBLIC_KEY = 'cwi_getPublicKey',
  GET_HEIGHT = 'cwi_getHeight',
  GET_HEADER_FOR_HEIGHT = 'cwi_getHeaderForHeight',
  GET_NETWORK = 'cwi_getNetwork',
  GET_VERSION = 'cwi_getVersion',
  IS_AUTHENTICATED = 'cwi_isAuthenticated',
  WAIT_FOR_AUTHENTICATION = 'cwi_waitForAuthentication',

  // Signing operations (require password)
  CREATE_ACTION = 'cwi_createAction',
  SIGN_ACTION = 'cwi_signAction',
  ABORT_ACTION = 'cwi_abortAction',
  INTERNALIZE_ACTION = 'cwi_internalizeAction',
  CREATE_SIGNATURE = 'cwi_createSignature',
  VERIFY_SIGNATURE = 'cwi_verifySignature',
  ENCRYPT = 'cwi_encrypt',
  DECRYPT = 'cwi_decrypt',
  CREATE_HMAC = 'cwi_createHmac',
  VERIFY_HMAC = 'cwi_verifyHmac',
  RELINQUISH_OUTPUT = 'cwi_relinquishOutput',

  // Certificate operations
  ACQUIRE_CERTIFICATE = 'cwi_acquireCertificate',
  LIST_CERTIFICATES = 'cwi_listCertificates',
  PROVE_CERTIFICATE = 'cwi_proveCertificate',
  RELINQUISH_CERTIFICATE = 'cwi_relinquishCertificate',
  DISCOVER_BY_IDENTITY_KEY = 'cwi_discoverByIdentityKey',
  DISCOVER_BY_ATTRIBUTES = 'cwi_discoverByAttributes',

  // Key linkage
  REVEAL_COUNTERPARTY_KEY_LINKAGE = 'cwi_revealCounterpartyKeyLinkage',
  REVEAL_SPECIFIC_KEY_LINKAGE = 'cwi_revealSpecificKeyLinkage',

  // Response events (from popup)
  CREATE_SIGNATURE_RESPONSE = 'cwi_createSignatureResponse',
  ENCRYPT_RESPONSE = 'cwi_encryptResponse',
  DECRYPT_RESPONSE = 'cwi_decryptResponse',
  CREATE_ACTION_RESPONSE = 'cwi_createActionResponse',
}

// BRC-100 Types (simplified for injection)
export type WalletNetwork = 'mainnet' | 'testnet';

export interface ListOutputsArgs {
  basket: string;
  tags?: string[];
  tagQueryMode?: 'all' | 'any';
  include?: 'locking scripts' | 'entire transactions';
  includeCustomInstructions?: boolean;
  includeTags?: boolean;
  includeLabels?: boolean;
  limit?: number;
  offset?: number;
  seekPermission?: boolean;
}

export interface WalletOutput {
  satoshis: number;
  lockingScript?: string;
  spendable: boolean;
  customInstructions?: string;
  tags?: string[];
  outpoint: string;
  labels?: string[];
}

export interface ListOutputsResult {
  totalOutputs: number;
  BEEF?: number[];
  outputs: WalletOutput[];
}

export interface GetPublicKeyArgs {
  identityKey?: boolean;
  protocolID?: [number, string];
  keyID?: string;
  counterparty?: string;
  forSelf?: boolean;
  privileged?: boolean;
  privilegedReason?: string;
  seekPermission?: boolean;
}

export interface GetPublicKeyResult {
  publicKey: string;
}

export interface CreateSignatureArgs {
  data?: number[];
  hashToDirectlySign?: number[];
  protocolID?: [number, string];
  keyID?: string;
  counterparty?: string;
  privileged?: boolean;
  privilegedReason?: string;
  seekPermission?: boolean;
}

export interface CreateSignatureResult {
  signature: number[];
}

export interface VerifySignatureArgs {
  data?: number[];
  hashToDirectlyVerify?: number[];
  signature: number[];
  protocolID?: [number, string];
  keyID?: string;
  counterparty?: string;
  forSelf?: boolean;
  privileged?: boolean;
  privilegedReason?: string;
  seekPermission?: boolean;
}

export interface VerifySignatureResult {
  valid: boolean;
}

export interface WalletEncryptArgs {
  plaintext: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty?: string;
  privileged?: boolean;
  privilegedReason?: string;
  seekPermission?: boolean;
}

export interface WalletEncryptResult {
  ciphertext: number[];
}

export interface WalletDecryptArgs {
  ciphertext: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty?: string;
  privileged?: boolean;
  privilegedReason?: string;
  seekPermission?: boolean;
}

export interface WalletDecryptResult {
  plaintext: number[];
}

export interface CreateActionArgs {
  description: string;
  inputs?: Record<string, unknown>[];
  outputs?: Record<string, unknown>[];
  lockTime?: number;
  version?: number;
  labels?: string[];
  options?: Record<string, unknown>;
  seekPermission?: boolean;
}

export interface CreateActionResult {
  txid?: string;
  tx?: number[];
  noSendChange?: string[];
  sendWithResults?: unknown[];
  signableTransaction?: unknown;
}

export interface SignActionArgs {
  spends: Record<string, unknown>;
  reference: string;
  options?: Record<string, unknown>;
  seekPermission?: boolean;
}

export interface SignActionResult {
  txid?: string;
  tx?: number[];
  sendWithResults?: unknown[];
}

export interface AbortActionArgs {
  reference: string;
  seekPermission?: boolean;
}

export interface AbortActionResult {
  aborted: boolean;
}

export interface ListActionsArgs {
  labels: string[];
  labelQueryMode?: 'all' | 'any';
  includeLabels?: boolean;
  includeInputs?: boolean;
  includeInputSourceLockingScripts?: boolean;
  includeInputUnlockingScripts?: boolean;
  includeOutputs?: boolean;
  includeOutputLockingScripts?: boolean;
  limit?: number;
  offset?: number;
  seekPermission?: boolean;
}

export interface ListActionsResult {
  totalActions: number;
  actions: unknown[];
}

export interface InternalizeActionArgs {
  tx: number[];
  outputs: unknown[];
  description: string;
  labels?: string[];
  seekPermission?: boolean;
}

export interface InternalizeActionResult {
  accepted: boolean;
}

export interface GetHeightResult {
  height: number;
}

export interface GetHeaderArgs {
  height: number;
}

export interface GetHeaderResult {
  header: string;
}

export interface GetNetworkResult {
  network: WalletNetwork;
}

export interface GetVersionResult {
  version: string;
}

export interface AuthenticatedResult {
  authenticated: boolean;
}

// Helper to create CWI methods with postMessage pattern
const createCWIMethod = <TResult, TArgs = Record<string, unknown>>(eventName: CWIEventName) => {
  return async (args: TArgs, originator?: string): Promise<TResult> => {
    return new Promise<TResult>((resolve, reject) => {
      const messageId = `${eventName}-${Date.now()}-${Math.random()}`;
      const requestEvent = new CustomEvent(CustomListenerName.YOURS_REQUEST, {
        detail: { messageId, type: eventName, params: { ...args, originator } },
      });

      function onResponse(e: Event) {
        const responseEvent = e as CustomEvent<{ success: boolean; data?: TResult; error?: string }>;
        const { detail } = responseEvent;
        if (detail.success) {
          resolve(detail.data as TResult);
        } else {
          reject(new Error(detail.error || 'Unknown error'));
        }
      }

      self.addEventListener(messageId, onResponse, { once: true });
      self.dispatchEvent(requestEvent);
    });
  };
};

// CWI Implementation - BRC-100 WalletInterface
export const CWI = {
  // Output Management
  listOutputs: createCWIMethod<ListOutputsResult, ListOutputsArgs>(CWIEventName.LIST_OUTPUTS),
  relinquishOutput: createCWIMethod<{ relinquished: boolean }, { basket: string; output: string }>(
    CWIEventName.RELINQUISH_OUTPUT,
  ),

  // Action Management
  createAction: createCWIMethod<CreateActionResult, CreateActionArgs>(CWIEventName.CREATE_ACTION),
  signAction: createCWIMethod<SignActionResult, SignActionArgs>(CWIEventName.SIGN_ACTION),
  abortAction: createCWIMethod<AbortActionResult, AbortActionArgs>(CWIEventName.ABORT_ACTION),
  listActions: createCWIMethod<ListActionsResult, ListActionsArgs>(CWIEventName.LIST_ACTIONS),
  internalizeAction: createCWIMethod<InternalizeActionResult, InternalizeActionArgs>(
    CWIEventName.INTERNALIZE_ACTION,
  ),

  // Key Operations
  getPublicKey: createCWIMethod<GetPublicKeyResult, GetPublicKeyArgs>(CWIEventName.GET_PUBLIC_KEY),
  revealCounterpartyKeyLinkage: createCWIMethod<unknown, unknown>(CWIEventName.REVEAL_COUNTERPARTY_KEY_LINKAGE),
  revealSpecificKeyLinkage: createCWIMethod<unknown, unknown>(CWIEventName.REVEAL_SPECIFIC_KEY_LINKAGE),

  // Cryptographic Operations
  encrypt: createCWIMethod<WalletEncryptResult, WalletEncryptArgs>(CWIEventName.ENCRYPT),
  decrypt: createCWIMethod<WalletDecryptResult, WalletDecryptArgs>(CWIEventName.DECRYPT),
  createHmac: createCWIMethod<{ hmac: number[] }, { data: number[]; protocolID: [number, string]; keyID: string }>(
    CWIEventName.CREATE_HMAC,
  ),
  verifyHmac: createCWIMethod<
    { valid: boolean },
    { data: number[]; hmac: number[]; protocolID: [number, string]; keyID: string }
  >(CWIEventName.VERIFY_HMAC),
  createSignature: createCWIMethod<CreateSignatureResult, CreateSignatureArgs>(CWIEventName.CREATE_SIGNATURE),
  verifySignature: createCWIMethod<VerifySignatureResult, VerifySignatureArgs>(CWIEventName.VERIFY_SIGNATURE),

  // Certificate Operations
  acquireCertificate: createCWIMethod<unknown, unknown>(CWIEventName.ACQUIRE_CERTIFICATE),
  listCertificates: createCWIMethod<unknown, unknown>(CWIEventName.LIST_CERTIFICATES),
  proveCertificate: createCWIMethod<unknown, unknown>(CWIEventName.PROVE_CERTIFICATE),
  relinquishCertificate: createCWIMethod<unknown, unknown>(CWIEventName.RELINQUISH_CERTIFICATE),
  discoverByIdentityKey: createCWIMethod<unknown, unknown>(CWIEventName.DISCOVER_BY_IDENTITY_KEY),
  discoverByAttributes: createCWIMethod<unknown, unknown>(CWIEventName.DISCOVER_BY_ATTRIBUTES),

  // Status & Info
  isAuthenticated: createCWIMethod<AuthenticatedResult, Record<string, never>>(CWIEventName.IS_AUTHENTICATED),
  waitForAuthentication: createCWIMethod<AuthenticatedResult, Record<string, never>>(
    CWIEventName.WAIT_FOR_AUTHENTICATION,
  ),
  getHeight: createCWIMethod<GetHeightResult, Record<string, never>>(CWIEventName.GET_HEIGHT),
  getHeaderForHeight: createCWIMethod<GetHeaderResult, GetHeaderArgs>(CWIEventName.GET_HEADER_FOR_HEIGHT),
  getNetwork: createCWIMethod<GetNetworkResult, Record<string, never>>(CWIEventName.GET_NETWORK),
  getVersion: createCWIMethod<GetVersionResult, Record<string, never>>(CWIEventName.GET_VERSION),
};

// Inject CWI on window
if (typeof window !== 'undefined') {
  (window as unknown as { CWI: typeof CWI }).CWI = CWI;
}
