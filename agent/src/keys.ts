import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PrivateKey } from '@bsv/sdk';
import { type WifBackup, decryptBackup, encryptBackup } from 'bitcoin-backup';
import { AgentError } from './errors';
import { ensureHome } from './config';
import { keysPath } from './paths';

export function hasKeyFile(): boolean {
  return existsSync(keysPath());
}

export function envWif(): string | undefined {
  return process.env.PRIVATE_KEY_WIF?.trim() || process.env.YOURS_AGENT_WIF?.trim() || undefined;
}

export function envPassword(): string | undefined {
  return process.env.YOURS_AGENT_PASSWORD || process.env.ONESAT_PASSWORD || undefined;
}

export async function loadPrivateKey(): Promise<PrivateKey> {
  const wif = envWif();
  if (wif) {
    return PrivateKey.fromWif(wif);
  }

  if (!hasKeyFile()) {
    throw new AgentError(
      'ERR_LOCKED',
      'No key found. Run `bun run agent:init` or set PRIVATE_KEY_WIF.',
      {},
      401,
    );
  }

  const password = envPassword();
  if (!password) {
    throw new AgentError(
      'ERR_LOCKED',
      'Password required to decrypt key file. Set YOURS_AGENT_PASSWORD (or ONESAT_PASSWORD).',
      {},
      401,
    );
  }

  const encrypted = readFileSync(keysPath(), 'utf8');
  const backup = await decryptBackup(encrypted, password);
  if (!('wif' in backup) || typeof backup.wif !== 'string') {
    throw new AgentError('ERR_LOCKED', 'Key file does not contain a WIF key.', {}, 401);
  }
  return PrivateKey.fromWif(backup.wif);
}

export async function savePrivateKey(wif: string, password: string): Promise<void> {
  ensureHome();
  PrivateKey.fromWif(wif);
  const payload: WifBackup = {
    wif,
    label: 'yours-agent',
    createdAt: new Date().toISOString(),
  };
  const encrypted = await encryptBackup(payload, password);
  writeFileSync(keysPath(), encrypted, { mode: 0o600 });
}

export function generateWif(): string {
  return PrivateKey.fromRandom().toWif();
}
