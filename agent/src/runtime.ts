import { createContext, deriveDepositAddresses, sendBsv } from '@1sat/actions';
import type { WalletInterface } from '@bsv/sdk';
import { loadConfig, type AgentConfig } from './config';
import { ADMIN_ORIGINATOR, MCP_ORIGINATOR, READONLY_METHODS, SPEND_METHODS, WALLET_METHODS, type WalletMethod } from './constants';
import { AgentError } from './errors';
import { loadPrivateKey } from './keys';
import { PolicyEngine, loadPolicy, spendFromCreateAction, type BudgetSnapshot } from './policy';
import { logError } from './redact';
import { openWallet, type OpenedWallet } from './wallet';

export class AgentRuntime {
  private constructor(
    readonly config: AgentConfig,
    readonly policy: PolicyEngine,
    readonly opened: OpenedWallet,
  ) {}

  static async start(): Promise<AgentRuntime> {
    const config = loadConfig();
    const policy = new PolicyEngine(loadPolicy());
    const privateKey = await loadPrivateKey();
    const opened = await openWallet(privateKey, config);
    return new AgentRuntime(config, policy, opened);
  }

  get wallet(): WalletInterface {
    return this.opened.wallet;
  }

  async close(): Promise<void> {
    await this.opened.result.destroy();
  }

  async call(method: string, args: unknown, originator: string): Promise<unknown> {
    if (!WALLET_METHODS.includes(method as WalletMethod)) {
      throw new AgentError('ERR_METHOD', `Unknown BRC-100 method: ${method}`, { method }, 404);
    }

    const readonly = READONLY_METHODS.has(method);
    if (!readonly) {
      this.policy.assertOriginator(originator);
    }

    let spend = 0;
    if (SPEND_METHODS.has(method)) {
      spend = spendFromCreateAction(args);
      this.policy.assertSpend(spend);
    }

    const fn = (this.opened.wallet as unknown as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      throw new AgentError('ERR_METHOD', `Wallet does not implement ${method}`, { method }, 501);
    }

    try {
      const result = await (fn as Function).call(this.opened.wallet, args ?? {}, ADMIN_ORIGINATOR);
      if (spend > 0) {
        this.policy.recordSpend(spend, originator);
      }
      return result;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      logError(`${method} failed`, err);
      throw new AgentError('ERR_WALLET', err instanceof Error ? err.message : 'Wallet call failed', { method }, 500);
    }
  }

  getBudget(): BudgetSnapshot {
    return this.policy.getBudget();
  }

  async walletInfo(): Promise<Record<string, unknown>> {
    const ctx = this.actionContext();
    const [addressResult, outputs, identity] = await Promise.all([
      deriveDepositAddresses.execute(ctx, { prefix: '1sat', count: 1 }),
      this.call('listOutputs', { basket: 'default', include: 'locking scripts', limit: 10000 }, MCP_ORIGINATOR),
      this.call('getPublicKey', { identityKey: true }, MCP_ORIGINATOR),
    ]);
    const list = outputs as { outputs?: Array<{ satoshis: number }>; totalOutputs?: number };
    const satoshis = (list.outputs ?? []).reduce((sum, o) => sum + (o.satoshis || 0), 0);
    return {
      chain: this.config.chain,
      address: addressResult.derivations[0]?.address ?? null,
      identityKey: (identity as { publicKey?: string }).publicKey ?? null,
      balance: satoshis,
      utxos: list.outputs?.length ?? 0,
    };
  }

  async sendBsv(to: string, satoshis: number): Promise<unknown> {
    this.policy.assertOriginator(MCP_ORIGINATOR);
    this.policy.assertSpend(satoshis);
    const ctx = this.actionContext();
    const result = await sendBsv.execute(ctx, { requests: [{ address: to, satoshis }] });
    if ((result as { error?: string }).error) {
      throw new AgentError('ERR_WALLET', String((result as { error: string }).error), {}, 500);
    }
    this.policy.recordSpend(satoshis, MCP_ORIGINATOR);
    return result;
  }

  private actionContext() {
    return createContext(this.opened.baseWallet, {
      services: this.opened.result.services,
      chain: this.config.chain,
      isBaseWallet: true,
    });
  }
}

let singleton: Promise<AgentRuntime> | null = null;

export function getRuntime(): Promise<AgentRuntime> {
  if (!singleton) {
    singleton = AgentRuntime.start();
  }
  return singleton;
}

export function resetRuntime(): void {
  singleton = null;
}
