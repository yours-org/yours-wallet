import { describe, expect, test } from 'bun:test';
import { WALLET_METHODS } from './constants';
import { AgentError } from './errors';

describe('BRC-100 method table', () => {
  test('includes the JSON substrate methods', () => {
    for (const method of ['createAction', 'listOutputs', 'getVersion', 'getNetwork', 'isAuthenticated', 'getPublicKey']) {
      expect(WALLET_METHODS).toContain(method);
    }
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
