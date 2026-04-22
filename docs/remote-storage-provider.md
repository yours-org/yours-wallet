# Remote Storage Provider Guide

How to add your storage service to the Yours Wallet provider registry and implement the required API.

## Adding Your Provider via PR

### 1. Add your entry to the provider registry

Open `src/components/ProviderPicker.tsx` and add your provider to the `KNOWN_PROVIDERS` array:

```ts
{
  id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Generate a unique UUID (e.g. via uuidgen or uuidgenerator.net)
  name: 'Your Provider Name',       // Display name shown in the wallet UI
  url: 'https://your-api.com',      // Base URL for your storage API
  description: 'Short description of your service.',
}
```

Pricing, capacity, and all other details are fetched live from your server's `/account/status` endpoint. You do not need to hardcode any pricing in the PR — the wallet will display whatever your server returns.

### 2. PR requirements

- Add only your entry to the `KNOWN_PROVIDERS` array — do not modify existing entries
- Your `GET /account/status` endpoint must be live and returning a valid response (see API spec below)
- Include a brief description of your service in the PR body

---

## Default Behavior

All wallets start with **local browser storage only** — no remotes configured. Users add remotes from the provider list in Settings > Wallet Backup > Remote Storage.

---

## Required API Endpoints

### `GET /account/status`

Returns the current account status, usage, and pricing.

**Headers:**

- `X-Storage-Identity-Key`: The wallet's storage identity key

**Response:**

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
    "satsPerUnit": 6250000,
    "durationBlocks": 4320
  },
  "nextPayment": {
    "derivationPrefix": "base64...",
    "derivationSuffix": "base64..."
  }
}
```

**Field reference:**

| Field                          | Type           | Description                                                                     |
| ------------------------------ | -------------- | ------------------------------------------------------------------------------- |
| `identityKey`                  | string         | The caller's identity key                                                       |
| `serverIdentityKey`            | string         | The server's identity key                                                       |
| `accountsEnabled`              | boolean        | Whether accounts are enabled on this server                                     |
| `currentBlock`                 | number         | Current block height                                                            |
| `usedBytes`                    | number         | Bytes stored for this caller                                                    |
| `baselineBytes`                | number         | Free capacity everyone gets                                                     |
| `paidBytes`                    | number         | Additional capacity from the latest active payment                              |
| `capacityBytes`                | number         | `baselineBytes + paidBytes`                                                     |
| `deficitBytes`                 | number         | `max(0, usedBytes - capacityBytes)`                                             |
| `paidThroughBlock`             | number \| null | Block height when the latest payment expires. `null` if no active payment.      |
| `pricing.purchaseUnitBytes`    | number         | Bytes per one purchase unit                                                     |
| `pricing.satsPerUnit`          | number         | Price per unit in satoshis. Server sets this and validates payments against it. |
| `pricing.durationBlocks`       | number         | How long a purchase lasts in blocks (~144 blocks/day)                           |
| `nextPayment.derivationPrefix` | string         | Base64-encoded BRC-29 derivation prefix the server expects for the payment      |
| `nextPayment.derivationSuffix` | string         | Base64-encoded derivation suffix (monotonic per payer)                          |

### Payment via BRC-29 Derivation

To purchase additional storage, the wallet creates a payment transaction using the BRC-29 derivation parameters from `nextPayment`. The server provides a unique `derivationPrefix` and `derivationSuffix` for each payment, ensuring the payment address is deterministic and verifiable by both sides without requiring a separate `/pay` endpoint.

The wallet sends `pricing.satsPerUnit` satoshis using the provided derivation parameters. The server monitors the blockchain for the payment and automatically provisions `pricing.purchaseUnitBytes` of additional capacity for `pricing.durationBlocks` blocks.

### Existing Sync Endpoints

Your server must also implement the standard wallet sync protocol used by `@bsv/wallet-toolbox`:

- Data sync (outputs, transactions, certificates) — see the BRC-100 wallet storage specification
- The wallet communicates with these via the `ChromeCWI` → service worker → wallet-toolbox pipeline

The `/account/status` endpoint above is an addition on top of the existing sync protocol.

---

## Pricing Model

Storage uses **metered pricing with block-based duration**:

- Each provider sets a **baseline** (e.g. 1 GB) — free capacity everyone gets
- Additional capacity is purchased in **units** (e.g. 1 GB per unit) at a fixed satoshi price
- Purchases last for a fixed number of **blocks** (~144 blocks/day, ~4320 blocks/month)
- When a purchase expires (`currentBlock > paidThroughBlock`), `paidBytes` drops to 0
- If `usedBytes > capacityBytes`, the server reports a `deficitBytes` and may restrict writes until the user purchases more

The wallet converts satoshi prices to USD for display using the cached BSV exchange rate.

---

## Payment Flow

```
┌─────────┐                    ┌─────────────┐
│  Wallet  │                    │   Storage    │
│          │                    │   Server     │
└────┬─────┘                    └──────┬──────┘
     │                                 │
     │  1. GET /status                 │
     │────────────────────────────────►│
     │  { usedBytes, deficitBytes,     │
     │    pricing, nextPayment }       │
     │◄────────────────────────────────│
     │                                 │
     │  2. If deficit: prompt user     │
     │                                 │
     │  3. Send satsPerUnit to address │
     │     derived from nextPayment    │
     │─────────────────► (on-chain)    │
     │                                 │
     │  4. Server detects payment      │
     │     on-chain, provisions        │
     │     paidBytes for               │
     │     durationBlocks              │
     │                                 │
     │  5. Sync proceeds               │
     │◄──────────────────────────────►│
```

### Pay-on-access model

Payments are checked during wallet sync (which happens on unlock). If the server returns `deficitBytes > 0` in the `/status` response, the wallet prompts the user before syncing. This avoids background timers and ensures payments are never missed.

### Identity

All storage uses the wallet's **storage identity key** — the same key already used for sync. No BAP identity is required. The storage identity key uniquely identifies the wallet installation. The server maps `identityKey → usage → billing`.

### Active vs Backup

A wallet can have one **active** storage location and zero or more **backup** locations:

- **Active**: Where the wallet reads and writes data. Can be local (this browser) or a remote server. Setting a remote as active enables multi-device sync.
- **Backup**: A copy of the data for safety. The wallet pushes data to backup remotes but doesn't read from them.

New wallets default to local-active with no remotes. Users add remotes from the provider list and can promote any remote to active.

---

## Provider Guidelines

- **Baseline capacity recommended**: Offering free storage (even 500 MB) helps adoption
- **Grace period**: If a purchase expires and the user is over capacity, allow a grace period before restricting writes
- **Read-only on deficit**: When `deficitBytes > 0`, allow read-only sync so users can still access their data
- **No data deletion**: Never delete user data without extended notice. Users should always be able to export.
- **Pricing transparency**: Pricing is shown in the wallet UI from your `/status` response. Users see the rate before committing.
