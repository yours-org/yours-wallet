# yours-agent sidecar

Headless BRC-100 wallet for LLM agents. The Chrome extension in this repo stays the human UI. Agents talk to:

- JSON WalletInterface at `http://127.0.0.1:3321` (`POST /createAction`, `/listOutputs`, `/getVersion`, …)
- MCP stdio tools (`wallet_info`, `send_bsv`, `create_action`, `get_budget`, …)

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

## Policy

Copy [policy.example.json](policy.example.json) to `~/.yours-agent/policy.json` (init does this). Caps are **not** writable from MCP.

| Field | Meaning |
| --- | --- |
| `originators` | Allowlist. `yours-agent://mcp` and localhost are the defaults |
| `maxSatsPerAction` | Hard max per `createAction` / `send_bsv` |
| `maxSatsPerHour` / `maxSatsPerDay` | Rolling windows |

Over-cap calls return `ERR_SPEND_CAP` plus `remaining` budget. No silent spend.

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
