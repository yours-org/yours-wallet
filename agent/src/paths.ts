import { homedir } from 'node:os';
import { join } from 'node:path';

export function agentHome(): string {
  return process.env.YOURS_AGENT_HOME?.trim() || join(homedir(), '.yours-agent');
}

export function keysPath(): string {
  return join(agentHome(), 'keys.bep');
}

export function configPath(): string {
  return join(agentHome(), 'config.json');
}

export function policyPath(): string {
  return join(agentHome(), 'policy.json');
}

export function spendLogPath(): string {
  return join(agentHome(), 'spend-log.json');
}

export function dataDir(): string {
  return join(agentHome(), 'data');
}

export function walletDbPath(chain: 'main' | 'test'): string {
  return join(dataDir(), `wallet-${chain}.db`);
}
