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

Pricing, capacity, and all other details are fetched live from your server's `GET /account/status` endpoint via `AuthFetch` (BRC-103 mutual authentication). You do not need to hardcode any pricing in the PR — the wallet displays whatever your server returns.

### 2. PR requirements

- Add only your entry to the `KNOWN_PROVIDERS` array — do not modify existing entries
- Your `GET /account/status` endpoint must be live and returning a valid response (see API spec below)
- Your server must support BRC-103 mutual authentication (the wallet uses `AuthFetch` from `@bsv/sdk`)
- Include a brief description of your service in the PR body

### Known providers vs custom remotes

Users can also add **custom remotes** by entering any URL. Custom remotes do not get `GET /account/status` calls — the wallet performs a BRC-103 liveness check (via `AuthFetch`) to verify connectivity. Custom remotes handle billing and auth out of band.

Only known providers (listed in `KNOWN_PROVIDERS`) get live pricing and usage data displayed in the wallet UI.

---

## Default Behavior

All wallets start with **local browser storage only** — no remotes configured. Users add remotes from the provider list in Settings > Wallet Backup > Remote Storage.

---

## Authentication

All requests to your server are made via `AuthFetch` from `@bsv/sdk`, which implements BRC-103 mutual authentication. The auth handshake happens automatically via `POST /.well-known/auth` at your server's origin. No API keys or custom headers are needed — the wallet's identity key authenticates every request.

---

## Required API Endpoints

### `GET /account/status`

Returns the current account status, usage, and pricing for the authenticated caller.

**Authentication:** BRC-103 mutual auth via `AuthFetch` (automatic — no manual headers needed).

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
- If `usedBytes > capacityBytes`, the server reports a `deficitBytes` and restricts writes

The wallet converts satoshi prices to USD for display using the cached BSV exchange rate.

---

## Payment Flow (507 Auto-Retry)

Payments are handled transparently by the `@1sat/wallet` SDK. No explicit payment endpoint is needed.

```
┌─────────┐                    ┌─────────────┐
│  Wallet  │                    │   Storage    │
│          │                    │   Server     │
└────┬─────┘                    └──────┬──────┘
     │                                 │
     │  1. Billable op (createAction,  │
     │     signAction, etc.)           │
     │────────────────────────────────►│
     │                                 │
     │  2. Server returns 507          │
     │     (over capacity)             │
     │◄────────────────────────────────│
     │                                 │
     │  3. SDK catches 507, fetches    │
     │     GET /account/status         │
     │────────────────────────────────►│
     │  { deficitBytes, pricing,       │
     │    nextPayment }                │
     │◄────────────────────────────────│
     │                                 │
     │  4. SDK builds BRC-29 payment   │
     │     using nextPayment derivation│
     │     params, broadcasts tx       │
     │─────────────────► (on-chain)    │
     │                                 │
     │  5. Server detects payment,     │
     │     credits capacity            │
     │                                 │
     │  6. SDK retries original op     │
     │────────────────────────────────►│
     │     ✓ Success                   │
     │◄────────────────────────────────│
```

### How it works

1. The wallet performs a billable operation (e.g. `wallet.createAction`)
2. If the user is over capacity, the server returns **HTTP 507 Insufficient Storage**
3. The `@1sat/wallet` SDK automatically catches the 507
4. It fetches `GET /account/status` to get current deficit, pricing, and `nextPayment` derivation params
5. It builds a BRC-29 self-payment transaction using `wallet.createAction` with the provided derivation prefix/suffix
6. The server detects the payment on-chain and credits capacity
7. The original operation is retried and succeeds

**User-visible behavior:** The operation just succeeds (slightly slower on first 507 while payment processes). No 507 errors surface to the UI.

### Payment failure

If the auto-payment fails (e.g. insufficient BSV balance), the SDK throws a `StoragePaymentError` with `code: 'storage-payment-failed'`. The wallet UI displays: "Your remote storage requires a payment that could not be completed. Please ensure you have enough BSV in your wallet."

### BRC-29 Payment Details

The payment transaction uses BRC-29 derivation:

- `protocolID`: `[2, '3241645161d8']`
- `keyID`: `{nextPayment.derivationPrefix} {nextPayment.derivationSuffix}`
- `counterparty`: `serverIdentityKey`
- Amount: `pricing.satsPerUnit × ceil(deficitBytes / pricing.purchaseUnitBytes)`

The server provides a unique `derivationPrefix` and `derivationSuffix` for each payment (monotonic per payer), making the payment address deterministic and verifiable by both sides.

---

## Identity

All storage uses the wallet's **storage identity key** — a per-install random identifier used as the local IndexedDB's store key. No BAP identity is required. The storage identity key uniquely identifies the wallet installation. Authentication is handled by BRC-103 mutual auth via `AuthFetch`.

## Active vs Backup

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
- **Pricing transparency**: Pricing is shown in the wallet UI from your `/account/status` response. Users see the rate before committing.
- **507 response required**: The payment flow depends on your server returning HTTP 507 when the user exceeds capacity during billable operations. Without this, the auto-payment SDK logic won't trigger.
