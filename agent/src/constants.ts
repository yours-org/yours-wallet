export const AGENT_VERSION = '0.1.0';
export const ADMIN_ORIGINATOR = 'yours-agent://daemon';
export const MCP_ORIGINATOR = 'yours-agent://mcp';
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 3321;

export const READONLY_METHODS = new Set([
  'listOutputs',
  'getVersion',
  'getNetwork',
  'isAuthenticated',
]);

export const WALLET_METHODS = [
  'createAction',
  'signAction',
  'abortAction',
  'listActions',
  'internalizeAction',
  'listOutputs',
  'relinquishOutput',
  'getPublicKey',
  'revealCounterpartyKeyLinkage',
  'revealSpecificKeyLinkage',
  'encrypt',
  'decrypt',
  'createHmac',
  'verifyHmac',
  'createSignature',
  'verifySignature',
  'acquireCertificate',
  'listCertificates',
  'proveCertificate',
  'relinquishCertificate',
  'discoverByIdentityKey',
  'discoverByAttributes',
  'isAuthenticated',
  'waitForAuthentication',
  'getHeight',
  'getHeaderForHeight',
  'getNetwork',
  'getVersion',
] as const;

export type WalletMethod = (typeof WALLET_METHODS)[number];

/**
 * Agent HTTP extras (not BRC-100 WalletInterface).
 * Identity BSM is different from createSignature (which uses derived protocol keys).
 */
export const AGENT_HTTP_METHODS = ['signMessage', 'signBsm', 'syncAddresses'] as const;

export const SPEND_METHODS = new Set<string>(['createAction']);
