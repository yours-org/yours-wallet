# yours-agent sidecar

Headless BRC-100 wallet for LLM agents. The Chrome extension in this repo stays the human UI. Agents talk to:

- JSON WalletInterface at `http://127.0.0.1:3321` (`POST /createAction`, `/listOutputs`, `/getVersion`, `/signMessage`, `/syncAddresses`, …)
- MCP stdio tools (`wallet_info`, `send_bsv`, `create_action`, `sign_message`, `sync_addresses`, `get_budget`, …)

Spending is gated by `~/.yours-agent/policy.json` (originator allowlist + satoshi caps). Unlock once per process via `YOURS_AGENT_PASSWORD` or `PRIVATE_KEY_WIF`.

## Setup

```bash
cd agent
bun install
cd ..

# Generate a new key (or import the identity WIF from Yours)
YOURS_AGENT_PASSWORD='choose-a-password' bun run agent:init -- --generate

# Optional: same key as Yours / 1sat CLI
PRIVATE_KEY_WIF='<identity WIF>' YOURS_AGENT_PASSWORD='choose-a-password' bun run agent:init -- --wif "$PRIVATE_KEY_WIF"
```

Never paste a WIF into chat logs. Prefer the env var.

To share UTXO history with the Yours extension, set the same remote storage URL:

```bash
YOURS_AGENT_REMOTE='https://your-storage.example' bun run agent:init -- --generate
```

## Run

```bash
# HTTP only (WalletClient / curl)
YOURS_AGENT_PASSWORD='…' bun run agent:daemon

# MCP stdio for Cursor (also starts HTTP unless YOURS_AGENT_HTTP=0)
YOURS_AGENT_PASSWORD='…' bun run agent:mcp
```

Cursor MCP config:

```json
{
  "mcpServers": {
    "yours-agent": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/yours-agent/agent/src/mcp.ts"],
      "env": {
        "YOURS_AGENT_PASSWORD": "set-in-your-secret-store"
      }
    }
  }
}
```

From the repo root you can also use `"args": ["run", "agent:mcp"]` with `"cwd"` set to the repo path.

Testnet: `YOURS_AGENT_CHAIN=test`.

## Policy / spend caps

Copy [policy.example.json](policy.example.json) to `~/.yours-agent/policy.json` (init does this). Caps are **not** writable from MCP (`get_budget` is read-only).

| Field | Meaning |
| --- | --- |
| `originators` | Allowlist. `yours-agent://mcp` and localhost are the defaults |
| `maxSatsPerAction` | Hard max per `createAction` / `send_bsv` (default **10_000**) |
| `maxSatsPerHour` / `maxSatsPerDay` | Rolling windows |

Over-cap calls return `ERR_SPEND_CAP` plus `remaining` budget. No silent spend.

To pay larger bounty amounts, edit the file yourself (example: raise per-action to 1 BSV = 100_000_000 sats):

```bash
# ~/.yours-agent/policy.json — human edit only
{
  "originators": ["yours-agent://mcp", "http://localhost", "http://127.0.0.1"],
  "maxSatsPerAction": 100000000,
  "maxSatsPerHour": 200000000,
  "maxSatsPerDay": 500000000
}
```

Restart the daemon/MCP process after changing policy. Do not set caps to unlimited unless you intentionally accept that risk.

## AI Bounties login (identity BSM)

Sites like [AI Bounties](https://entangleit.com/bsvbounties) verify a **Bitcoin Signed Message** against your **identity compressed pubkey** — not a BRC-42 derived key.

1. `get_public_key` with `identityKey: true` (or `wallet_info` / `address`) → `controllerKey`
2. `POST /v1/auth/challenge` with `{ controllerKey }` → `{ challenge, message }` where `message` is typically `aibounties-auth-v1:${challenge}`
3. MCP `sign_message` with that exact `message` (do **not** pre-hash) → `{ signature, publicKey, address }`
4. `POST /v1/auth/login` with `{ controllerKey, challenge, signature }`

```bash
# HTTP twin
curl -s -X POST http://127.0.0.1:3321/signMessage \
  -H 'content-type: application/json' \
  -H 'Originator: yours-agent://mcp' \
  -d '{"message":"aibounties-auth-v1:YOUR_CHALLENGE"}'
```

**Important:** BRC-100 `createSignature` and `@1sat/actions` `signBsm` derive a protocol key. Those signatures will **not** verify against the identity pubkey. Always use `sign_message` / `POST /signMessage` for identity logins.

## Deposits / list_outputs

Inbound plain P2PKH payments to the default **1sat** deposit address are not visible until the indexer sync runs. The sidecar:

- Calls `syncAddresses` on startup (even though `skipInitialMonitor` stays true for monitor startup cost)
- Re-syncs before `wallet_info` / `balance` / `list_outputs` (throttled)
- Exposes MCP `sync_addresses` and HTTP `POST /syncAddresses` for an explicit refresh

Fresh deposits land in basket `1sat-deposit`, then `sweepDeposit` (run inside sync) moves spendable BSV into funding basket `default`. `wallet_info.balance` sums both.

```bash
curl -s -X POST http://127.0.0.1:3321/syncAddresses \
  -H 'content-type: application/json' \
  -H 'Originator: http://localhost' \
  -d '{"force":true}'
```

## HTTP

Bind is localhost only (`127.0.0.1:3321`). Send `Origin` or `Originator` per BRC-5.

```bash
curl -s -X POST http://127.0.0.1:3321/getVersion -H 'content-type: application/json' -d '{}'
curl -s -X POST http://127.0.0.1:3321/listOutputs -H 'content-type: application/json' -d '{"basket":"default","limit":10}'
```

## Tests

```bash
bun run agent:test
YOURS_AGENT_PASSWORD='…' bun run agent:smoke   # live wallet on testnet storage (throwaway key)
```
