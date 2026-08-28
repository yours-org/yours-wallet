---
name: yours-agent
description: Operates the yours-agent BRC-100 Bitcoin SV wallet via MCP tools or localhost JSON API. Use when sending BSV, creating actions, listing outputs, checking balance, spend caps, Yours Wallet keys, or BRC-100 WalletInterface methods.
---

# yours-agent

Headless BRC-100 wallet sidecar. Do not drive the Chrome extension UI. Do not log WIF, mnemonic, or passwords.

## Prefer MCP tools

If the `yours-agent` MCP server is connected, use:

- Read: `wallet_info`, `balance`, `address`, `list_outputs`, `list_actions`, `get_budget`, `sync_addresses`
- Spend: `send_bsv` or `create_action` (both hit spend caps)
- Crypto: `get_public_key`, `encrypt`, `decrypt`, `sign_action`, **`sign_message`** (identity BSM)

### AI Bounties / identity login

1. Read `identityKey` from `wallet_info` or `get_public_key` (`identityKey: true`).
2. Fetch the site challenge; sign the returned **`message`** string with `sign_message` (usually `aibounties-auth-v1:${challenge}`).
3. Submit compact base64 `signature` + identity pubkey to login.

Do **not** use `createSignature` / derived-key signing for identity BSM — verifiers check the root identity pubkey.

### Deposits

After someone sends to the 1sat deposit address, call `sync_addresses` (or `wallet_info`) so indexer UTXOs appear. `list_outputs` syncs by default. Unswept coins may sit in basket `1sat-deposit` until swept into `default`.

Policy is not writable from MCP. Edit `~/.yours-agent/policy.json` only with an explicit human request. Default `maxSatsPerAction` is 10_000 — raise it for larger bounty payouts; do not remove all limits unless asked.

## HTTP fallback

If MCP is unavailable, POST JSON to `http://127.0.0.1:3321/<method>` with `Origin` or `Originator`. Bind is localhost only.

```http
POST /getVersion HTTP/1.1
Content-Type: application/json

{}
```

```http
POST /signMessage HTTP/1.1
Content-Type: application/json
Originator: yours-agent://mcp

{
  "message": "aibounties-auth-v1:YOUR_CHALLENGE"
}
```

```http
POST /syncAddresses HTTP/1.1
Content-Type: application/json
Originator: http://localhost

{
  "force": true
}
```

```http
POST /createAction HTTP/1.1
Content-Type: application/json
Originator: yours-agent://mcp

{
  "description": "Payment",
  "outputs": [
    {
      "lockingScript": "76a914...88ac",
      "satoshis": 1000,
      "outputDescription": "payment"
    }
  ]
}
```

Read-only after unlock (no originator allowlist): `listOutputs`, `getVersion`, `getNetwork`, `isAuthenticated`. Everything else must be allowlisted (`yours-agent://mcp` and localhost by default).

## Spend caps

`createAction` spend is the sum of `outputs[].satoshis`. Over-cap returns `ERR_SPEND_CAP` with `remaining` (`hourRemaining`, `dayRemaining`, `maxSatsPerAction`). Do not retry a larger amount. Call `get_budget` instead.

## Keys

Unlock is process-wide via `YOURS_AGENT_PASSWORD` / `ONESAT_PASSWORD` (decrypts `~/.yours-agent/keys.bep`) or `PRIVATE_KEY_WIF` / `YOURS_AGENT_WIF`. Import the Yours identity WIF to share identity with the extension. Optional `YOURS_AGENT_REMOTE` shares BRC-100 storage history. Chrome IndexedDB is not shared.

Never print env values or keystore contents.

## Start locally

```bash
YOURS_AGENT_PASSWORD='…' bun run agent:daemon
YOURS_AGENT_PASSWORD='…' bun run agent:mcp
```
