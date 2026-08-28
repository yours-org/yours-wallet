#!/usr/bin/env bun
/**
 * Live smoke: init a throwaway wallet, serve HTTP, hit getVersion/getNetwork/listOutputs,
 * and confirm over-cap createAction is rejected. Keys are never printed.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateKey } from '@bsv/sdk';
import { saveConfig } from './config';
import { handleWalletRequest } from './http';
import { savePrivateKey } from './keys';
import { dispatchMcp } from './mcp';
import { installDefaultPolicyIfMissing, loadPolicy, PolicyEngine } from './policy';
import { getRuntime, resetRuntime } from './runtime';

const home = mkdtempSync(join(tmpdir(), 'yours-agent-smoke-'));
process.env.YOURS_AGENT_HOME = home;
process.env.YOURS_AGENT_CHAIN = 'test';
process.env.YOURS_AGENT_PASSWORD = 'smoke-test-password';
delete process.env.PRIVATE_KEY_WIF;
delete process.env.YOURS_AGENT_WIF;

async function main(): Promise<void> {
  installDefaultPolicyIfMissing();
  saveConfig({
    chain: 'test',
    storageIdentityKey: 'yours-agent-smoke',
    httpHost: '127.0.0.1',
    httpPort: 3321,
  });
  await savePrivateKey(PrivateKey.fromRandom().toWif(), process.env.YOURS_AGENT_PASSWORD!);
  resetRuntime();

  const runtime = await getRuntime();
  const caller = async (method: string, args: unknown, originator: string) => {
    if (method === 'signMessage' || method === 'signBsm') {
      const message = String((args as { message?: string })?.message ?? '');
      return runtime.signMessage(message, originator);
    }
    if (method === 'syncAddresses') {
      const body = (args ?? {}) as { prefix?: string; count?: number; force?: boolean };
      return runtime.syncDeposits({
        prefix: body.prefix,
        count: body.count,
        force: body.force === true,
      });
    }
    return runtime.call(method, args, originator);
  };

  const versionRes = await handleWalletRequest(new Request('http://127.0.0.1:3321/getVersion', { method: 'POST', body: '{}' }), caller);
  const networkRes = await handleWalletRequest(new Request('http://127.0.0.1:3321/getNetwork', { method: 'GET' }), caller);
  const outputsRes = await handleWalletRequest(
    new Request('http://127.0.0.1:3321/listOutputs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ basket: 'default', limit: 10 }),
    }),
    caller,
  );

  const policy = new PolicyEngine(loadPolicy());
  const huge = { description: 'cap test', outputs: [{ lockingScript: '76a914000000000000000000000000000000000000000088ac', satoshis: 50_000_000, outputDescription: 'over cap' }] };
  let capOk = false;
  try {
    policy.assertSpend(50_000_000);
  } catch (err) {
    const e = err as { code?: string; extra?: { remaining?: unknown } };
    capOk = e.code === 'ERR_SPEND_CAP' && !!e.extra?.remaining;
  }

  const capRes = await handleWalletRequest(
    new Request('http://127.0.0.1:3321/createAction', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Originator: 'yours-agent://mcp' },
      body: JSON.stringify(huge),
    }),
    caller,
  );

  const version = await versionRes.json();
  const network = await networkRes.json();
  const outputs = await outputsRes.json();
  const capBody = await capRes.json();

  const dump = JSON.stringify({ version, network, outputs, capBody, home: '[temp]' });
  if (/[5KL][1-9A-HJ-NP-Za-km-z]{50,52}/.test(dump) || dump.includes('smoke-test-password')) {
    throw new Error('Smoke output leaked a secret');
  }

  if (versionRes.status >= 500) throw new Error(`getVersion failed: ${dump}`);
  if (networkRes.status >= 500) throw new Error(`getNetwork failed: ${dump}`);
  if (outputsRes.status >= 500) throw new Error(`listOutputs failed: ${dump}`);
  if (!capOk) throw new Error('Policy engine did not reject over-cap spend');
  if (capRes.status !== 403 && capBody?.code !== 'ERR_SPEND_CAP') {
    throw new Error(`createAction cap miss: ${JSON.stringify(capBody)}`);
  }

  const budgetMsg = (await dispatchMcp({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'get_budget', arguments: {} },
  })) as { result?: { isError?: boolean; content?: Array<{ text: string }> } };
  if (budgetMsg.result?.isError) {
    throw new Error(`get_budget failed: ${budgetMsg.result.content?.[0]?.text}`);
  }
  const budgetText = budgetMsg.result?.content?.[0]?.text ?? '';
  if (!budgetText.includes('maxSatsPerAction')) {
    throw new Error(`get_budget missing caps: ${budgetText}`);
  }

  const signMsg = (await dispatchMcp({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: { name: 'sign_message', arguments: { message: 'aibounties-auth-v1:smoke-challenge' } },
  })) as { result?: { isError?: boolean; content?: Array<{ text: string }> } };
  if (signMsg.result?.isError) {
    throw new Error(`sign_message failed: ${signMsg.result.content?.[0]?.text}`);
  }
  const signText = signMsg.result?.content?.[0]?.text ?? '';
  if (!signText.includes('signature') || !signText.includes('publicKey')) {
    throw new Error(`sign_message missing fields: ${signText}`);
  }
  if (/[5KL][1-9A-HJ-NP-Za-km-z]{50,52}/.test(signText) || signText.includes('smoke-test-password')) {
    throw new Error('sign_message leaked a secret');
  }

  const syncHttp = await handleWalletRequest(
    new Request('http://127.0.0.1:3321/syncAddresses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Originator: 'yours-agent://mcp' },
      body: JSON.stringify({ force: true, count: 1 }),
    }),
    caller,
  );
  // sync may fail offline; surface only hard routing failures
  if (syncHttp.status === 404) throw new Error('syncAddresses route missing');

  const infoMsg = (await dispatchMcp({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'wallet_info', arguments: {} },
  })) as { result?: { isError?: boolean; content?: Array<{ text: string }> } };
  if (infoMsg.result?.isError) {
    throw new Error(`wallet_info failed: ${infoMsg.result.content?.[0]?.text}`);
  }
  const infoText = infoMsg.result?.content?.[0]?.text ?? '';
  if (!infoText.includes('identityKey') || !infoText.includes('balance')) {
    throw new Error(`wallet_info missing fields: ${infoText}`);
  }
  if (/[5KL][1-9A-HJ-NP-Za-km-z]{50,52}/.test(infoText) || infoText.includes('smoke-test-password')) {
    throw new Error('MCP output leaked a secret');
  }

  await runtime.close();
  console.error('[yours-agent] smoke ok');
  console.error(
    `[yours-agent] getVersion=${versionRes.status} getNetwork=${networkRes.status} listOutputs=${outputsRes.status} createActionCap=${capRes.status} signMessage=ok syncAddresses=${syncHttp.status} mcp=ok`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
