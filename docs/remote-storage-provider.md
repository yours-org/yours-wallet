# Remote Storage Provider Guide

Run a BRC-100 wallet storage server that Yours Wallet users can connect to — for free community hosting, paid storage, or personal use.

## Quick Start

```bash
# Install and initialize the 1sat CLI
bunx @1sat/cli init

# Start a storage server (local use, no billing)
1sat config set server.accounts.enabled false
1sat serve
```

Your server is now running at `http://localhost:8100`. Point Yours Wallet at it as a custom remote.

## What This Does

Yours Wallet stores transaction history on a remote server so users can recover their data and sync across devices. As a provider, you run a BRC-100 storage server using the `1sat serve` command. The server handles authentication (BRC-103), data sync, and optionally, metered billing — all built in.

---

## Server Setup

### Prerequisites

- [Bun](https://bun.sh) runtime
- `@1sat/cli` (`bun add -g @1sat/cli`)

### Initialize

```bash
1sat init
```

This creates your wallet, generates keys, and writes config to `~/.1sat/config.json`.

### Start the Server

```bash
1sat serve              # Wallet server + background monitor
1sat serve wallet       # Server only (no monitor)
1sat serve monitor      # Monitor only (no HTTP)
```

The server uses the same wallet instance as CLI commands — one wallet on disk, accessible via both HTTP and CLI.

### Configuration

All settings live under `server.*` in config. Edit via `1sat config set`:

```bash
# Network
1sat config set server.host 0.0.0.0       # Listen on all interfaces (default: 127.0.0.1)
1sat config set server.port 8100          # Port (default: 8100)

# Storage backend
1sat config set server.storage.provider bun-sqlite   # Default. Use "pg" for Postgres.
```

---

## Three Modes

### 1. Personal Use (No Billing)

Run a server just for yourself — sync your own wallet across devices.

```bash
1sat config set server.accounts.enabled false
1sat serve
```

Add `http://localhost:8100` (or your machine's IP) as a custom remote in Yours Wallet.

### 2. Free Community Server

Offer free storage to anyone, with a capacity limit per user.

```bash
1sat config set server.accounts.enabled true
1sat config set server.accounts.baselineBytes 1073741824      # 1 GB free per user
1sat config set server.accounts.satsPerUnit 0                 # No paid tier
1sat serve
```

### 3. Paid Storage Provider

Offer free baseline storage with metered billing for additional capacity.

```bash
1sat config set server.accounts.enabled true
1sat config set server.accounts.baselineBytes 1073741824      # 1 GB free per user
1sat config set server.accounts.purchaseUnitBytes 1073741824  # Sell in 1 GB chunks
1sat config set server.accounts.satsPerUnit 1000000           # Price per chunk in satoshis
1sat config set server.accounts.durationBlocks 4383           # ~1 month validity
1sat serve
```

**How billing works:** When a user exceeds their free baseline, the server returns HTTP 507. The Yours Wallet SDK automatically builds a BRC-29 payment transaction, broadcasts it, and retries — all transparent to the user. No payment endpoints to implement.

### Configuration Reference

| Setting                             | Default             | Description                       |
| ----------------------------------- | ------------------- | --------------------------------- |
| `server.host`                       | `127.0.0.1`         | Listen address                    |
| `server.port`                       | `8100`              | Listen port                       |
| `server.storage.provider`           | `bun-sqlite`        | `bun-sqlite` or `pg`              |
| `server.accounts.enabled`           | `false`             | Enable per-user capacity metering |
| `server.accounts.baselineBytes`     | `1073741824` (1 GB) | Free capacity per user            |
| `server.accounts.purchaseUnitBytes` | `1073741824` (1 GB) | Billing chunk size                |
| `server.accounts.satsPerUnit`       | `1000000`           | Satoshis per chunk                |
| `server.accounts.durationBlocks`    | `4383`              | Payment validity (~1 month)       |

### USD-Based Pricing

The `satsPerUnit` config is a static value. If you want to price in USD (e.g. "$1/GB/month") and have the satoshi amount adjust automatically with the BSV exchange rate, you'll need a process that periodically updates the config.

A simple approach — run a cron job that fetches the current BSV/USD rate and recalculates `satsPerUnit`:

```bash
# Example: price 1 GB at $1/month, update every hour
# fetch_rate.sh
#!/bin/bash
RATE=$(curl -s 'https://api.whatsonchain.com/v1/bsv/main/exchangerate' | jq '.rate')
TARGET_USD=1.00
SATS=$(echo "scale=0; ($TARGET_USD / $RATE) * 100000000" | bc)
1sat config set server.accounts.satsPerUnit $SATS
```

```bash
# crontab -e
0 * * * * /path/to/fetch_rate.sh
```

The server reads `satsPerUnit` from config on each billing check, so changes take effect immediately without restarting. Existing payments honor the rate at the time they were made — only new purchases use the updated rate.

For more control (rate smoothing, minimum price floors, multi-currency), you'd implement a custom wrapper around the 1sat server that manages the config programmatically.

---

## Adding to the Yours Wallet Provider List

To make your server appear in the Yours Wallet "Add Provider" picker (so users can find you without entering a URL), submit a PR.

### 1. Add your entry

Open `src/components/ProviderPicker.tsx` and add to the `KNOWN_PROVIDERS` array:

```ts
{
  id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Generate a UUID
  name: 'Your Provider Name',
  url: 'https://your-server.com/wallet',
  description: 'Short description of your service.',
}
```

### 2. Requirements

- Your `GET /account/status` endpoint must be live and returning valid data
- Your server must support BRC-103 mutual authentication
- Add only your entry — do not modify existing providers

Pricing and capacity are fetched live from your server. Nothing is hardcoded in the wallet.

---

## How the Wallet Connects

### Known providers

The wallet fetches `GET /account/status` via `AuthFetch` (BRC-103) to display live pricing and usage data.

### Custom remotes

Users enter any URL. On add, the wallet performs a BRC-103 liveness check via `AuthFetch` to verify connectivity. After adding, periodic status checks use a simple HTTP connectivity check (not `AuthFetch`). No `/account/status` call — custom remotes handle billing out of band if needed.

### Authentication

All communication uses `AuthFetch` from `@bsv/sdk` (BRC-103 mutual authentication). The handshake happens automatically via `POST /.well-known/auth`. No API keys or custom headers needed.

---

## Status Endpoint

`GET /account/status` — returned automatically by `1sat serve` when accounts are enabled.

```json
{
  "identityKey": "02abc...",
  "serverIdentityKey": "03def...",
  "accountsEnabled": true,
  "currentBlock": 890123,
  "usedBytes": 52428800,
  "baselineBytes": 1073741824,
  "paidBytes": 0,
  "capacityBytes": 1073741824,
  "deficitBytes": 0,
  "paidThroughBlock": null,
  "pricing": {
    "purchaseUnitBytes": 1073741824,
    "satsPerUnit": 1000000,
    "durationBlocks": 4383
  },
  "nextPayment": {
    "derivationPrefix": "base64...",
    "derivationSuffix": "base64..."
  }
}
```

| Field              | Description                                        |
| ------------------ | -------------------------------------------------- |
| `usedBytes`        | Bytes stored for this user                         |
| `baselineBytes`    | Free capacity                                      |
| `paidBytes`        | Additional capacity from payment                   |
| `capacityBytes`    | `baselineBytes + paidBytes`                        |
| `deficitBytes`     | `max(0, usedBytes - capacityBytes)`                |
| `paidThroughBlock` | Block height when payment expires (`null` if none) |
| `pricing.*`        | Current billing rates                              |
| `nextPayment.*`    | BRC-29 derivation params for the next payment      |

---

## Payment Flow

Handled entirely by the SDK — no code to write.

1. User performs a billable operation (send, inscribe, etc.)
2. Server returns **507 Insufficient Storage** if over capacity
3. `@1sat/wallet` SDK catches the 507, fetches `/account/status`
4. SDK builds a BRC-29 payment using `nextPayment` derivation params
5. Server detects payment on-chain, credits capacity
6. Original operation retries and succeeds

The user sees nothing — the operation just takes slightly longer on first 507.

If the user has insufficient BSV, the wallet shows: "Your remote storage requires a payment that could not be completed."

---

## Operational Notes

- **Key management**: Server uses the same key as the CLI (`PRIVATE_KEY_WIF` env or `~/.1sat/keys.bep`)
- **Database**: SQLite at `~/.1sat/data/wallet-main.db` by default. Use Postgres for production: `1sat config set server.storage.provider pg`
- **Monitor**: `1sat serve` runs a background monitor for broadcast/proof lifecycle. `1sat serve wallet` skips it if you run the monitor separately.
- **Reads are always free**: Only writes (createAction, signAction, internalizeAction) are metered
- **Active vs backup**: Only the active remote triggers 507 payments. Backup remotes receive pushed data without billing.
