import { createContext, deriveDepositAddresses, sendBsv, syncAddresses } from '@1sat/actions';
import type { PrivateKey, WalletInterface } from '@bsv/sdk';
import { signIdentityBsm, type SignedBsmMessage } from './bsm';
import { loadConfig, type AgentConfig } from './config';
import { ADMIN_ORIGINATOR, MCP_ORIGINATOR, READONLY_METHODS, SPEND_METHODS, WALLET_METHODS, type WalletMethod } from './constants';
import { AgentError } from './errors';
import { loadPrivateKey } from './keys';
import { dataDir } from './paths';
import { PolicyEngine, loadPolicy, spendFromCreateAction, type BudgetSnapshot } from './policy';
import { logError, logInfo } from './redact';
import { openWallet, type OpenedWallet } from './wallet';

/** @1sat/types FUNDING_BASKET — spendable BRC-29 outputs after deposit sweep. */
const FUNDING_BASKET = 'default';
/** @1sat/types DEPOSIT_BASKET — plain P2PKH inbounds before sweepDeposit. */
const DEPOSIT_BASKET = '1sat-deposit';

const SYNC_MIN_INTERVAL_MS = 15_000;

export class AgentRuntime {
  private lastSyncAt = 0;
  private syncInFlight: Promise<SyncDepositsResult> | null = null;

  private constructor(
    readonly config: AgentConfig,
    readonly policy: PolicyEngine,
    readonly opened: OpenedWallet,
    /** Identity root key — never log or return this. */
    private readonly identityKey: PrivateKey,
  ) {}

  static async start(): Promise<AgentRuntime> {
    const config = loadConfig();
    const policy = new PolicyEngine(loadPolicy());
    const privateKey = await loadPrivateKey();
    const opened = await openWallet(privateKey, config);
    const runtime = new AgentRuntime(config, policy, opened, privateKey);
    // skipInitialMonitor leaves the wallet blind to external 1sat P2PKH deposits.
    // Kick off indexer sync so list_outputs / balance see inbound payments.
    void runtime.syncDeposits().catch((err) => logError('initial deposit sync failed', err));
    return runtime;
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

  /**
   * Identity-key Bitcoin Signed Message (compact base64).
   * Required for AI Bounties login; BRC-100 createSignature / signBsm will not verify.
   */
  signMessage(message: string, originator: string = MCP_ORIGINATOR): SignedBsmMessage {
    this.policy.assertOriginator(originator);
    try {
      return signIdentityBsm(this.identityKey, message);
    } catch (err) {
      throw new AgentError('ERR_WALLET', err instanceof Error ? err.message : 'BSM sign failed', {}, 500);
    }
  }

  /**
   * Derive 1sat deposit addresses, pull new UTXOs from the indexer, internalize them,
   * and sweep plain BSV into the funding (default) basket when possible.
   */
  async syncDeposits(opts: { prefix?: string; count?: number; force?: boolean } = {}): Promise<SyncDepositsResult> {
    const force = opts.force === true;
    const now = Date.now();
    if (!force && this.syncInFlight) {
      return this.syncInFlight;
    }
    if (!force && now - this.lastSyncAt < SYNC_MIN_INTERVAL_MS && this.lastSyncAt > 0) {
      return {
        skipped: true,
        reason: 'throttled',
        processed: 0,
        failed: 0,
        lastScore: 0,
        addresses: [],
      };
    }

    const run = (async (): Promise<SyncDepositsResult> => {
      const ctx = this.actionContext();
      const result = await syncAddresses.execute(ctx, {
        prefix: opts.prefix ?? '1sat',
        count: opts.count ?? 1,
      });
      this.lastSyncAt = Date.now();
      logInfo(
        `deposit sync processed=${result.processed} failed=${result.failed} addresses=${result.addresses.length}`,
      );
      return {
        skipped: false,
        processed: result.processed,
        failed: result.failed,
        lastScore: result.lastScore,
        addresses: result.addresses,
      };
    })();

    this.syncInFlight = run;
    try {
      return await run;
    } finally {
      if (this.syncInFlight === run) this.syncInFlight = null;
    }
  }

  async walletInfo(): Promise<Record<string, unknown>> {
    await this.syncDeposits().catch((err) => logError('deposit sync before wallet_info failed', err));
    const ctx = this.actionContext();
    const [addressResult, funding, deposit, identity] = await Promise.all([
      deriveDepositAddresses.execute(ctx, { prefix: '1sat', count: 1 }),
      this.call('listOutputs', { basket: FUNDING_BASKET, include: 'locking scripts', limit: 10000 }, MCP_ORIGINATOR),
      this.call('listOutputs', { basket: DEPOSIT_BASKET, include: 'locking scripts', limit: 10000 }, MCP_ORIGINATOR),
      this.call('getPublicKey', { identityKey: true }, MCP_ORIGINATOR),
    ]);
    const fundingList = funding as { outputs?: Array<{ satoshis: number }>; totalOutputs?: number };
    const depositList = deposit as { outputs?: Array<{ satoshis: number }>; totalOutputs?: number };
    const fundingSats = (fundingList.outputs ?? []).reduce((sum, o) => sum + (o.satoshis || 0), 0);
    const depositSats = (depositList.outputs ?? []).reduce((sum, o) => sum + (o.satoshis || 0), 0);
    return {
      chain: this.config.chain,
      address: addressResult.derivations[0]?.address ?? null,
      identityKey: (identity as { publicKey?: string }).publicKey ?? null,
      balance: fundingSats + depositSats,
      fundingBalance: fundingSats,
      depositBalance: depositSats,
      utxos: (fundingList.outputs?.length ?? 0) + (depositList.outputs?.length ?? 0),
    };
  }

  async sendBsv(to: string, satoshis: number): Promise<unknown> {
    this.policy.assertOriginator(MCP_ORIGINATOR);
    this.policy.assertSpend(satoshis);
    await this.syncDeposits().catch((err) => logError('deposit sync before send failed', err));
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
      dataDir: dataDir(),
    });
  }
}

export interface SyncDepositsResult {
  skipped: boolean;
  reason?: string;
  processed: number;
  failed: number;
  lastScore: number;
  addresses: string[];
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
