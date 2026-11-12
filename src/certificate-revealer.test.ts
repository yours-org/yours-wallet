import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { Wallet } from '@bsv/wallet-toolbox-client';
import { Certificate, KeyDeriver, MasterCertificate, PrivateKey, ProtoWallet, VerifiableCertificate } from '@bsv/sdk';

async function fixture(Manager = Wallet) {
  const subjectKey = new KeyDeriver(new PrivateKey(11));
  const subject = new ProtoWallet(subjectKey);
  const certifier = new ProtoWallet(new PrivateKey(12));
  const revealer = new ProtoWallet(new PrivateKey(13));
  const verifier = new ProtoWallet(new PrivateKey(14));
  const revealerKey = (await revealer.getPublicKey({ identityKey: true })).publicKey;
  const verifierKey = (await verifier.getPublicKey({ identityKey: true })).publicKey;
  const certificate = await MasterCertificate.issueCertificateForSubject(
    certifier,
    subjectKey.identityKey,
    { name: 'Alice', membership: 'test member' },
    Buffer.alloc(32, 1).toString('base64'),
    async () => `${'ab'.repeat(32)}.0`,
    Buffer.alloc(32, 2).toString('base64'),
  );
  const rewrapped: Record<string, string> = {};
  for (const [field, encrypted] of Object.entries(certificate.fields)) {
    const { fieldRevelationKey } = await MasterCertificate.decryptField(
      subject,
      certificate.masterKeyring,
      field,
      encrypted,
      certificate.certifier,
    );
    const { ciphertext } = await revealer.encrypt({
      ...Certificate.getCertificateFieldEncryptionDetails(field),
      plaintext: fieldRevelationKey,
      counterparty: subjectKey.identityKey,
    });
    rewrapped[field] = Buffer.from(ciphertext).toString('base64');
  }
  const inserted: any[] = [];
  const storage = {
    _authId: { identityKey: subjectKey.identityKey },
    async insertCertificate(value: any) {
      inserted.push(structuredClone(value));
    },
    async listCertificates() {
      return {
        totalCertificates: inserted.length,
        certificates: inserted.map((row) => ({
          ...row,
          fields: Object.fromEntries(row.fields.map((field: any) => [field.fieldName, field.fieldValue])),
          keyring: Object.fromEntries(row.fields.map((field: any) => [field.fieldName, field.masterKey])),
        })),
      };
    },
  };
  const wallet = new Manager({ chain: 'test', keyDeriver: subjectKey, storage: storage as any });
  const args = {
    acquisitionProtocol: 'direct' as const,
    type: certificate.type,
    serialNumber: certificate.serialNumber,
    certifier: certificate.certifier,
    revocationOutpoint: certificate.revocationOutpoint,
    fields: certificate.fields,
    signature: certificate.signature!,
    keyringForSubject: rewrapped,
    keyringRevealer: revealerKey,
  };
  return { wallet, certificate, args, inserted, verifier, verifierKey, revealerKey };
}

for (const format of ['esm', 'cjs'] as const) {
  test(`${format}: third-party keyring revealer acquires and proves an issuer-signed certificate`, async () => {
    const require = createRequire(import.meta.url);
    const f = await fixture(format === 'esm' ? Wallet : require('@bsv/wallet-toolbox-client').Wallet);
    expect(await f.certificate.verify()).toBe(true);
    const acquired = await f.wallet.acquireCertificate(f.args);
    expect(acquired.signature).toBe(f.certificate.signature);
    expect(acquired.certifier).toBe(f.certificate.certifier);
    expect(f.inserted).toHaveLength(1);
    expect(f.inserted[0].verifier).toBe(f.revealerKey);
    const proof = await f.wallet.proveCertificate({
      certificate: acquired,
      fieldsToReveal: ['name'],
      verifier: f.verifierKey,
    });
    const disclosure = VerifiableCertificate.fromCertificate(acquired, proof.keyringForVerifier);
    expect(await disclosure.verify()).toBe(true);
    expect(await disclosure.decryptFields(f.verifier)).toEqual({ name: 'Alice' });
    expect(Object.keys(proof.keyringForVerifier)).toEqual(['name']);
  });
}

test('wrong declared revealer rejects before any certificate is inserted', async () => {
  const f = await fixture();
  await expect(f.wallet.acquireCertificate({ ...f.args, keyringRevealer: 'certifier' })).rejects.toThrow(
    'Failed to decrypt all master certificate fields',
  );
  expect(f.inserted).toHaveLength(0);
});

test('a corrupt issuer signature cannot be bypassed by a valid third-party keyring', async () => {
  const f = await fixture();
  const bytes = Buffer.from(f.args.signature, 'hex');
  bytes[bytes.length - 1] ^= 1;
  await expect(f.wallet.acquireCertificate({ ...f.args, signature: bytes.toString('hex') })).rejects.toThrow();
  expect(f.inserted).toHaveLength(0);
});

test('certifier sentinel and legacy storage without verifier retain original proof behavior', async () => {
  const f = await fixture();
  const acquired = await f.wallet.acquireCertificate({
    ...f.args,
    keyringForSubject: f.certificate.masterKeyring,
    keyringRevealer: 'certifier',
  });
  expect(f.inserted[0].verifier).toBe(f.certificate.certifier);
  delete f.inserted[0].verifier; // Legacy records used the certifier as their implicit keyring counterparty.
  const proof = await f.wallet.proveCertificate({
    certificate: acquired,
    fieldsToReveal: ['membership'],
    verifier: f.verifierKey,
  });
  expect(
    await VerifiableCertificate.fromCertificate(acquired, proof.keyringForVerifier).decryptFields(f.verifier),
  ).toEqual({ membership: 'test member' });
});
