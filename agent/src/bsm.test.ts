import { describe, expect, test } from 'bun:test';
import { BSM, PrivateKey, Signature, Utils } from '@bsv/sdk';
import { signIdentityBsm } from './bsm';

describe('signIdentityBsm', () => {
  test('compact base64 verifies against identity pubkey (AI Bounties shape)', () => {
    const key = PrivateKey.fromRandom();
    const challenge = 'test-challenge-abc123';
    const message = `aibounties-auth-v1:${challenge}`;
    const signed = signIdentityBsm(key, message);

    expect(signed.message).toBe(message);
    expect(signed.publicKey).toBe(key.toPublicKey().toString());
    expect(signed.publicKey).toMatch(/^(02|03)[0-9a-fA-F]{64}$/);
    expect(signed.signature.length).toBeGreaterThan(40);
    expect(JSON.stringify(signed)).not.toMatch(/[5KL][1-9A-HJ-NP-Za-km-z]{50,52}/);

    const messageBytes = Utils.toArray(message, 'utf8');
    const sig = Signature.fromCompact(signed.signature, 'base64');
    expect(BSM.verify(messageBytes, sig, key.toPublicKey())).toBe(true);
  });

  test('does not verify against a different key', () => {
    const key = PrivateKey.fromRandom();
    const other = PrivateKey.fromRandom();
    const message = 'aibounties-auth-v1:other';
    const signed = signIdentityBsm(key, message);
    const sig = Signature.fromCompact(signed.signature, 'base64');
    expect(BSM.verify(Utils.toArray(message, 'utf8'), sig, other.toPublicKey())).toBe(false);
  });
});
