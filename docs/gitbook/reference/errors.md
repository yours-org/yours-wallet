---
description: Catalog of error codes — what triggers them and how an agent should respond.
icon: triangle-exclamation
---

# Errors

Errors arrive through two channels:

1. **In-result** — `result.error: string` on the action's response envelope.
2. **Thrown** — network failures, wallet-level errors, validation throws.

Always check both.

## Pattern: handling errors

```tsx
try {
  const result = await sendBsv.execute(ctx, { requests: [...] });
  if (result.error) {
    handleActionError(result.error);
    return;
  }
  handleSuccess(result.txid!);
} catch (err) {
  if ((err as any)?.code === 'storage-payment-failed') {
    promptUserToTopUp();
    return;
  }
  handleUnexpected(err);
}
```

## Error code catalog

| Code | Trigger | Agent remediation | User-visible message |
|------|---------|-------------------|----------------------|
| `user-rejected` | User denied the wallet prompt | Surface a friendly message; allow retry. Do not auto-retry. | "Action cancelled. Try again?" |
| `storage-payment-failed` | Wallet's remote storage is metered and the user is out of paid storage | Direct the user to top up their BSV balance | "Your wallet needs more BSV to cover storage. Add funds and retry." |
| `insufficient-funds` | Not enough BSV in `default` basket to cover amount + fees | Show balance and required amount; suggest top-up | "Insufficient BSV balance. You have X, need Y." |
| `insufficient-mnee` | Not enough MNEE balance for `sendMnee` | Show MNEE balance; suggest top-up | "Insufficient MNEE balance." |
| `insufficient-token-balance` | Not enough of the BSV-21 token | Show token balance | "Insufficient `{symbol}` balance." |
| `no-beef` | Action required `inputBEEF` but it was missing or empty | Re-fetch via `getOrdinals` and retry | "Could not load transaction data — please retry." |
| `not-connected` | Wallet became disconnected mid-call | Call `connect()`; defer the action | "Please connect your wallet." |
| `not-found` | Output / outpoint / ordinal not in wallet | Refetch via `getOrdinals`; the in-app cache may be stale | "Item not found — refreshing..." |
| `not-lister` | Tried to cancel a listing the wallet did not create | Surface error; only the original lister can cancel | "Only the original lister can cancel this listing." |
| `not-registered` | Tried to deregister an OpNS name that is not currently registered | Skip deregister; offer registration if appropriate | "This name is not currently registered." |
| `already-registered` | Tried to register an OpNS name that is already bound | Deregister first or use a different name | "This name is already registered." |
| `already-spent` | Marketplace listing was already purchased or cancelled by the time you acted | Refetch listings; offer to buy a different one | "Listing no longer available." |
| `collection-full` | Tried to mint into a collection that has hit its `quantity` cap | Surface error; this collection cannot accept more items | "This collection is full." |
| `invalid-address` | Malformed BSV address | Validate before sending; reject with format hint | "Invalid address format." |
| `invalid-destination` | Malformed `Destination` object (BSV-21 recipients, inscribe destination) | Validate; ensure proper `{ address, ... }` shape | "Invalid recipient." |
| `paymail-resolution-failed` | `paymail` did not resolve | Verify paymail spelling; check the recipient's paymail provider | "Could not resolve paymail." |
| `invalid-amount` | Non-integer satoshis, non-positive value, or wrong type for MNEE (`amount` must be `number`) | Coerce / validate before sending | "Invalid amount." |
| `invalid-token-id` | BSV-21 `tokenId` not in expected `txid_vout` (underscore) format | Fix the format; underscore not dot | (Developer error — surface to logs) |
| `invalid-counterparty` | Counterparty pubkey not 33-byte compressed hex | Validate pubkey format before calling | (Developer error) |
| `invalid-content` | Bad base64 in `inscribe` / `mintCollection` etc. | Verify base64 encoding with `Utils.toBase64` | "Could not process content." |
| `invalid-ciphertext` | `decryptFromCounterparty` got bad ciphertext or wrong counterparty | Show error; user should verify the sender | "Could not decrypt message." |
| `invalid-height` | `lockBsv.until` not a positive integer block height | Validate input | (Developer error) |
| `invalid-profile` | BAP profile shape invalid | Validate against Schema.org expectations | "Profile data invalid." |
| `nothing-to-unlock` | `unlockBsv` called when nothing is currently unlockable | Pre-check with `getLockData` | "No locks ready to unlock yet." |
| `no-inputs` | Sweep action received empty inputs array | Skip; nothing to do | (No user message needed) |
| `no-spendable-outputs` | `sendAllBsv` with empty `default` basket | Show empty-balance state | "Nothing to send." |
| `signing-failed` | Sweep key did not unlock the input | Verify WIF matches the address | "Could not sign — wrong key?" |
| `output-not-found` | `purchaseOrdinal` outpoint does not exist | Refetch marketplace; offer alternatives | "Listing no longer available." |

## Network / transport errors

These are thrown, not returned in `result.error`:

* `fetch` / `ECONNREFUSED` / timeout — wallet's backend services unreachable. Retry with exponential backoff.
* `TypeError: Failed to fetch` — usually CORS or network. Check that your dApp origin is allowed.

## Logging

Log the error code, the action name, and any non-sensitive input shape. NEVER log:

* User addresses (privacy)
* Private keys (security)
* Plaintext encrypted messages

## See also

- [Concept: Permissions](../concepts/permissions.md)
- [Concept: Actions & Context](../concepts/actions-and-context.md)
- [For AI Agents](../ai-onboarding.md)
