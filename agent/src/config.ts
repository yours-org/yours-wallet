import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from './constants';
import { agentHome, configPath, dataDir } from './paths';

export interface AgentConfig {
  chain: 'main' | 'test';
  storageIdentityKey: string;
  activeRemote?: string;
  backups?: string[];
  httpHost: string;
  httpPort: number;
}

const DEFAULTS: AgentConfig = {
  chain: 'main',
  storageIdentityKey: 'yours-agent',
  httpHost: DEFAULT_HTTP_HOST,
  httpPort: DEFAULT_HTTP_PORT,
};

export function ensureHome(): void {
  mkdirSync(agentHome(), { recursive: true, mode: 0o700 });
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
}

export function loadConfig(): AgentConfig {
  ensureHome();
  const path = configPath();
  if (!existsSync(path)) {
    return applyEnv({ ...DEFAULTS, storageIdentityKey: randomStorageIdentity() });
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentConfig>;
  return applyEnv({
    ...DEFAULTS,
    ...raw,
    chain: raw.chain === 'test' ? 'test' : 'main',
    httpHost: raw.httpHost || DEFAULT_HTTP_HOST,
    httpPort: Number(raw.httpPort) || DEFAULT_HTTP_PORT,
    storageIdentityKey: raw.storageIdentityKey || randomStorageIdentity(),
  });
}

export function saveConfig(config: AgentConfig): void {
  ensureHome();
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

function applyEnv(config: AgentConfig): AgentConfig {
  const chain = process.env.YOURS_AGENT_CHAIN;
  const remote = process.env.YOURS_AGENT_REMOTE;
  const port = process.env.YOURS_AGENT_PORT;
  const host = process.env.YOURS_AGENT_HOST;
  return {
    ...config,
    chain: chain === 'test' || chain === 'main' ? chain : config.chain,
    activeRemote: remote || config.activeRemote,
    httpPort: port ? Number(port) : config.httpPort,
    httpHost: host || config.httpHost,
  };
}

function randomStorageIdentity(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `yours-agent-${hex}`;
}
