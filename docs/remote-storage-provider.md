# Remote Storage Provider Guide

How to add your storage service to the Yours Wallet provider registry and implement the required API.

## Adding Your Provider via PR

### 1. Add your entry to the provider registry

Open `src/pages/StorageStatus.tsx` and add your provider to the `KNOWN_PROVIDERS` array:

```ts
{
  id: 'your-provider-id',        // Unique lowercase slug (e.g. "acme-storage")
  name: 'Your Provider Name',    // Display name shown in the wallet UI
  url: 'https://your-api.com',   // Base URL for your storage API
  description: 'Short description of your service and what makes it unique.',
  freeTierBytes: 1_073_741_824,  // Free tier size in bytes (0 if no free tier)
}
```

### 2. PR requirements

- Add only your entry to the `KNOWN_PROVIDERS` array — do not modify existing entries
- Your API must be live and responding at the URL you provide
- Your `GET /status` endpoint must return a valid response (see API spec below)
- Include a brief description of your service in the PR body

---

## Required API Endpoints

Your storage server must implement the following endpoints. The wallet communicates with these directly.

### `GET /status`

Returns the current account status, usage, and available tiers for the authenticated user.

**Headers:**

- `X-Storage-Identity-Key`: The wallet's storage identity key (always available, uniquely identifies the wallet)

**Response:**

```json
{
  "provider": "Your Provider Name",
  "usedBytes": 52428800,
  "totalBytes": 1073741824,
  "tier": "free",
  "tiers": [
    {
      "id": "free",
      "name": "Free",
      "storageLimitBytes": 1073741824,
      "priceInSats": 0,
      "description": "1 GB included with every wallet"
    },
    {
      "id": "pro",
      "name": "Pro",
      "storageLimitBytes": 10737418240,
      "priceInSats": 5000,
      "description": "10 GB for power users"
    }
  ],
  "paymentAddress": "1YourBSVPaymentAddressHere",
  "paymentDue": false,
  "paymentAmount": null,
  "lastPayment": null
}
```

**Field reference:**

| Field                       | Type           | Description                                                                                                                                                                         |
| --------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                  | string         | Your provider display name                                                                                                                                                          |
| `usedBytes`                 | number         | Current storage used in bytes                                                                                                                                                       |
| `totalBytes`                | number         | Total storage quota in bytes. Use `-1` for unlimited.                                                                                                                               |
| `tier`                      | string         | Current tier ID for this user                                                                                                                                                       |
| `tiers`                     | array          | All available tiers with pricing                                                                                                                                                    |
| `tiers[].id`                | string         | Unique tier identifier                                                                                                                                                              |
| `tiers[].name`              | string         | Display name                                                                                                                                                                        |
| `tiers[].storageLimitBytes` | number         | Storage limit in bytes. `-1` for unlimited.                                                                                                                                         |
| `tiers[].priceInSats`       | number         | Monthly cost in satoshis. `0` for free. Server sets this value and uses it to validate payment transactions. The wallet converts to USD for display using the cached exchange rate. |
| `tiers[].description`       | string         | Short description shown in the upgrade UI                                                                                                                                           |
| `paymentAddress`            | string         | BSV address where the wallet sends tier upgrade payments. Always required — the wallet uses this to know where to pay.                                                              |
| `paymentDue`                | boolean        | Whether a payment is required before the next sync                                                                                                                                  |
| `paymentAmount`             | number \| null | Amount due in satoshis (when `paymentDue` is true)                                                                                                                                  |
| `lastPayment`               | string \| null | ISO 8601 timestamp of last payment received                                                                                                                                         |

### `POST /pay`

Called by the wallet after sending a BSV payment to the provider's `paymentAddress`. The server should verify the transaction on-chain and upgrade the user's tier.

**Request body:**

```json
{
  "storageIdentityKey": "02a1b2c3d4e5f6...",
  "txid": "a1b2c3d4e5f6...",
  "tierId": "pro"
}
```

**Field reference:**

| Field                | Type   | Description                       |
| -------------------- | ------ | --------------------------------- |
| `storageIdentityKey` | string | The wallet's storage identity key |
| `txid`               | string | Transaction ID of the BSV payment |
| `tierId`             | string | The tier being purchased          |

**Response (success):**

```json
{
  "success": true,
  "tier": "pro",
  "totalBytes": 10737418240,
  "validUntil": "2026-05-17T00:00:00Z"
}
```

**Response (failure):**

```json
{
  "success": false,
  "error": "Payment not found on-chain"
}
```

### Existing Sync Endpoints

Your server must also implement the standard wallet sync protocol used by `@bsv/wallet-toolbox`. These are the endpoints the wallet uses for actual data synchronization:

- Data sync (outputs, transactions, certificates) — see the BRC-100 wallet storage specification
- The wallet communicates with these via the `ChromeCWI` → service worker → wallet-toolbox pipeline

The `/status` and `/pay` endpoints above are additions on top of the existing sync protocol.

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
     │  { tier, paymentDue, tiers }    │
     │◄────────────────────────────────│
     │                                 │
     │  2. User selects upgrade tier   │
     │                                 │
     │  3. Send BSV to paymentAddress  │
     │─────────────────► (on-chain)    │
     │                                 │
     │  4. POST /pay { storageIdentityKey, txid }
     │────────────────────────────────►│
     │  { success, tier, validUntil }  │
     │◄────────────────────────────────│
     │                                 │
     │  5. Sync proceeds with new tier │
     │◄──────────────────────────────►│
```

### Pay-on-access model

Payments are checked during wallet sync (which happens on unlock). If the server returns `paymentDue: true` in the `/status` response, the wallet prompts the user before syncing. This avoids background timers and ensures payments are never missed.

### Identity

All tiers use the wallet's **storage identity key** — the same key already used for sync. No BAP identity is required. The storage identity key uniquely identifies the wallet, and the on-chain payment txid proves the payment. The server maps `storageIdentityKey → tier → quota`.

---

## Provider Guidelines

- **Free tier recommended**: Offering a free tier (even small) helps with adoption
- **Grace period**: If a paid user's payment lapses, retain their data for at least 30 days before restricting access
- **Read-only on lapse**: When payment is overdue, allow read-only sync so users can still access their data
- **No data deletion**: Never delete user data without extended notice. Users should always be able to export.
- **Pricing transparency**: All pricing is shown in the wallet UI from your `/status` response. Users see exactly what they'll pay before committing.
