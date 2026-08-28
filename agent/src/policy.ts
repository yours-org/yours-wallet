import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentError } from './errors';
import { ensureHome } from './config';
import { policyPath, spendLogPath } from './paths';

export interface AgentPolicy {
  originators: string[];
  maxSatsPerAction: number;
  maxSatsPerHour: number;
  maxSatsPerDay: number;
}

export interface BudgetSnapshot {
  maxSatsPerAction: number;
  maxSatsPerHour: number;
  maxSatsPerDay: number;
  spentLastHour: number;
  spentLastDay: number;
  hourRemaining: number;
  dayRemaining: number;
}

interface SpendEntry {
  ts: number;
  sats: number;
  originator: string;
}

interface SpendLog {
  entries: SpendEntry[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_POLICY: AgentPolicy = {
  originators: ['yours-agent://mcp', 'http://localhost', 'http://127.0.0.1'],
  maxSatsPerAction: 10_000,
  maxSatsPerHour: 50_000,
  maxSatsPerDay: 200_000,
};

export function installDefaultPolicyIfMissing(): void {
  ensureHome();
  if (existsSync(policyPath())) return;
  const example = join(dirname(fileURLToPath(import.meta.url)), '..', 'policy.example.json');
  if (existsSync(example)) {
    copyFileSync(example, policyPath());
  } else {
    writeFileSync(policyPath(), JSON.stringify(DEFAULT_POLICY, null, 2) + '\n', { mode: 0o600 });
  }
}

export function loadPolicy(): AgentPolicy {
  installDefaultPolicyIfMissing();
  const raw = JSON.parse(readFileSync(policyPath(), 'utf8')) as Partial<AgentPolicy>;
  return {
    originators: Array.isArray(raw.originators) && raw.originators.length ? raw.originators : DEFAULT_POLICY.originators,
    maxSatsPerAction: Number(raw.maxSatsPerAction) || DEFAULT_POLICY.maxSatsPerAction,
    maxSatsPerHour: Number(raw.maxSatsPerHour) || DEFAULT_POLICY.maxSatsPerHour,
    maxSatsPerDay: Number(raw.maxSatsPerDay) || DEFAULT_POLICY.maxSatsPerDay,
  };
}

export function originatorAllowed(originator: string, allowlist: string[]): boolean {
  const normalized = normalizeOriginator(originator);
  for (const allowed of allowlist) {
    const a = normalizeOriginator(allowed);
    if (normalized === a) return true;
    if (a === 'localhost' && isLocalhost(normalized)) return true;
    if ((a === 'http://localhost' || a === 'http://127.0.0.1') && isLocalhost(normalized)) return true;
    if (normalized.startsWith(a)) return true;
  }
  return false;
}

export function normalizeOriginator(originator: string): string {
  return originator.trim().replace(/\/+$/, '').toLowerCase();
}

export function isLocalhost(originator: string): boolean {
  const value = originator.includes('://') ? originator : `http://${originator}`;
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return originator.includes('localhost') || originator.includes('127.0.0.1');
  }
}

export function spendFromCreateAction(args: unknown): number {
  if (!args || typeof args !== 'object') return 0;
  const outputs = (args as { outputs?: Array<{ satoshis?: number }> }).outputs;
  if (!Array.isArray(outputs)) return 0;
  return outputs.reduce((sum, out) => sum + (Number(out?.satoshis) || 0), 0);
}

export class PolicyEngine {
  constructor(
    private policy: AgentPolicy,
    private logPath = spendLogPath(),
  ) {}

  getPolicy(): AgentPolicy {
    return this.policy;
  }

  getBudget(now = Date.now()): BudgetSnapshot {
    const { hour, day } = this.spent(now);
    return {
      maxSatsPerAction: this.policy.maxSatsPerAction,
      maxSatsPerHour: this.policy.maxSatsPerHour,
      maxSatsPerDay: this.policy.maxSatsPerDay,
      spentLastHour: hour,
      spentLastDay: day,
      hourRemaining: Math.max(0, this.policy.maxSatsPerHour - hour),
      dayRemaining: Math.max(0, this.policy.maxSatsPerDay - day),
    };
  }

  assertOriginator(originator: string): void {
    if (!originatorAllowed(originator, this.policy.originators)) {
      throw new AgentError('ERR_ORIGINATOR', `Originator not allowlisted: ${originator}`, { originator }, 403);
    }
  }

  assertSpend(sats: number, now = Date.now()): BudgetSnapshot {
    const budget = this.getBudget(now);
    if (sats < 0 || !Number.isFinite(sats)) {
      throw new AgentError('ERR_SPEND_CAP', 'Invalid satoshi amount', { sats }, 400);
    }
    if (sats > this.policy.maxSatsPerAction) {
      throw this.capError('per-action', sats, budget);
    }
    if (budget.spentLastHour + sats > this.policy.maxSatsPerHour) {
      throw this.capError('hourly', sats, budget);
    }
    if (budget.spentLastDay + sats > this.policy.maxSatsPerDay) {
      throw this.capError('daily', sats, budget);
    }
    return budget;
  }

  recordSpend(sats: number, originator: string, now = Date.now()): void {
    if (sats <= 0) return;
    const log = this.readLog();
    log.entries.push({ ts: now, sats, originator });
    log.entries = log.entries.filter((e) => now - e.ts <= DAY_MS);
    writeFileSync(this.logPath, JSON.stringify(log) + '\n', { mode: 0o600 });
  }

  private capError(kind: string, sats: number, budget: BudgetSnapshot): AgentError {
    return new AgentError(
      'ERR_SPEND_CAP',
      `Spend of ${sats} sats exceeds the ${kind} cap`,
      { sats, remaining: budget },
      403,
    );
  }

  private spent(now: number): { hour: number; day: number } {
    const log = this.readLog();
    let hour = 0;
    let day = 0;
    for (const entry of log.entries) {
      const age = now - entry.ts;
      if (age <= DAY_MS) day += entry.sats;
      if (age <= HOUR_MS) hour += entry.sats;
    }
    return { hour, day };
  }

  private readLog(): SpendLog {
    if (!existsSync(this.logPath)) return { entries: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.logPath, 'utf8')) as SpendLog;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
    } catch {
      return { entries: [] };
    }
  }
}
