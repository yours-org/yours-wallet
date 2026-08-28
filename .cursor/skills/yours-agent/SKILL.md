---
name: yours-agent
description: Operates the yours-agent BRC-100 Bitcoin SV wallet via MCP tools or localhost JSON API. Use when sending BSV, creating actions, listing outputs, checking balance, spend caps, Yours Wallet keys, or BRC-100 WalletInterface methods.
---

# yours-agent

Headless BRC-100 wallet sidecar. Do not drive the Chrome extension UI. Do not log WIF, mnemonic, or passwords.

## Prefer MCP tools

If the `yours-agent` MCP server is connected, use:

- Read: `wallet_info`, `balance`, `address`, `list_outputs`, `list_actions`, `get_budget`
- Spend: `send_bsv` or `create_action` (both hit spend caps)
- Crypto: `get_public_key`, `encrypt`, `decrypt`, `sign_action`

Policy is not writable from MCP. Edit `~/.yours-agent/policy.json` only with an explicit human request.

## HTTP fallback

If MCP is unavailable, POST JSON to `http://127.0.0.1:3321/<method>` with `Origin` or `Originator`. Bind is localhost only.

```http
POST /getVersion HTTP/1.1
Content-Type: application/json

{}
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
