import { describe, expect, test } from 'bun:test';
import { AGENT_HTTP_METHODS, WALLET_METHODS } from './constants';
import { AgentError } from './errors';

describe('BRC-100 method table', () => {
  test('includes the JSON substrate methods', () => {
    for (const method of ['createAction', 'listOutputs', 'getVersion', 'getNetwork', 'isAuthenticated', 'getPublicKey']) {
      expect(WALLET_METHODS).toContain(method);
    }
  });

  test('agent HTTP extras cover identity BSM and deposit sync', () => {
    expect(AGENT_HTTP_METHODS).toContain('signMessage');
    expect(AGENT_HTTP_METHODS).toContain('syncAddresses');
    expect(WALLET_METHODS).not.toContain('signMessage');
  });
});

describe('AgentError JSON', () => {
  test('never includes a wif field', () => {
    const err = new AgentError('ERR_LOCKED', 'No key found', {}, 401);
    const json = JSON.stringify(err.toJSON());
    expect(json).not.toMatch(/[5KL][1-9A-HJ-NP-Za-km-z]{50,}/);
    expect(json).not.toContain('password');
  });
});
