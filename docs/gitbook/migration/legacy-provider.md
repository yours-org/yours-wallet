---
description: Map the legacy window.yours injected provider to the modern @1sat/actions API.
icon: arrow-right-arrow-left
---

# Legacy Provider → @1sat/actions

If you previously integrated with Yours Wallet via the `window.yours` injected provider, this page maps every legacy method to its modern equivalent.

{% hint style="warning" %}
The `window.yours` global is **deprecated**. Use `@1sat/actions` for all new code. Old Stack Overflow answers, blog posts, and the previous GitBook reference the legacy global — agents finding those should consult this page before writing code.
{% endhint %}

## Connection & status

| Legacy | Modern |
|--------|--------|
| `yours.connect()` | `<WalletProvider>` + `useWallet()` + `<ConnectButton>` (from `@1sat/react`). Auto-detects BRC-100 wallets. |
| `yours.isConnected()` | `useWallet().status === 'connected'` — reactive |
| `yours.disconnect()` | `useWallet().disconnect()` |
| `yours.on('signedOut', fn)` | `window.addEventListener('YoursEmitEvent', fn)`; check `e.detail.action === 'signedOut'` |
| `yours.on('switchAccount', fn)` | Same — `e.detail.action === 'switchAccount'` |

## Payments

| Legacy | Modern |
|--------|--------|
| `yours.sendBsv(requests)` | `sendBsv.execute(ctx, { requests })` |
| `yours.getBalance()` | `wallet.listOutputs({ basket: 'default' })` then sum `o.satoshis` |
| `yours.getAddresses()` | `deriveDepositAddresses.execute(ctx, { startIndex, count })` — default prefix `'1sat'` (P1SAT) |
| `yours.getPubKeys()` | `wallet.getPublicKey({ protocolID, keyID })` |

## Ordinals

| Legacy | Modern |
|--------|--------|
| `yours.getOrdinals()` | `getOrdinals.execute(ctx, {})` — now returns `{ outputs, BEEF }` |
| `yours.transferOrdinal(outpoint, address)` | Two steps: `getOrdinals` then `transferOrdinals.execute(ctx, { transfers, inputBEEF })`. BEEF must be fetched first. |
| `yours.inscribe(payload)` | `inscribe.execute(ctx, { base64Content, contentType, map?, signWithBAP? })`. Content must be pre-encoded as base64. |

## Marketplace

| Legacy | Modern |
|--------|--------|
| `yours.listOrdinal(outpoint, price)` | `listOrdinal.execute(ctx, { ordinal, inputBEEF, price, payAddress })` |
| `yours.purchaseOrdinal(outpoint)` | `purchaseOrdinal.execute(ctx, { outpoint })` |
| `yours.cancelListing(outpoint)` | `cancelListing.execute(ctx, { listing, inputBEEF })` |

## Identity (BAP)

| Legacy | Modern |
|--------|--------|
| `yours.getProfile()` | `getProfile.execute(ctx, {})` |
| `yours.publishIdentity()` | `publishIdentity.execute(ctx, {})` |
| `yours.updateProfile(profile)` | `updateProfile.execute(ctx, { profile })` |

## Signing & encryption

| Legacy | Modern |
|--------|--------|
| `yours.signMessage(message)` | `signBsm.execute(ctx, { message })` — returns `{ sig, address, pubKey }` |
| `yours.encrypt(message, pubkeys)` | `encryptForCounterparty.execute(ctx, { counterparty, message })` — single counterparty per call |
| `yours.decrypt(messages)` | `decryptFromCounterparty.execute(ctx, { counterparty, ciphertext })` |

## Tokens

| Legacy | Modern |
|--------|--------|
| `yours.getTokens()` | `getBsv21Balances.execute(ctx, {})` |
| `yours.sendToken(...)` | `sendBsv21.execute(ctx, { tokenId, recipients })` — amounts are STRINGS in atomic units; tokenIds use UNDERSCORE format `txid_vout` |

## Locks

| Legacy | Modern |
|--------|--------|
| `yours.lockBsv(reqs)` | `lockBsv.execute(ctx, { requests })` |
| `yours.unlockBsv()` | `unlockBsv.execute(ctx, {})` |

## Generic transaction operations

The legacy provider exposed a single `yours.sendTx` for everything. In the modern API:

* For wallet-managed transactions: use the appropriate `@1sat/actions` action.
* For custom transactions: use `wallet.createAction({ description, outputs, options })` directly. See [Transaction Actions](../low-level/transaction-actions.md).

## Why migrate

1. **BRC-100 standard.** A uniform interface across BSV wallets — your dApp works with any BRC-100 wallet, not just Yours.
2. **Multi-device sync.** Modern Yours Wallet supports remote storage; users see consistent state across devices.
3. **BEEF.** Transaction ancestry is first-class. Required for overlay-network compatibility.
4. **Type safety.** `@1sat/actions` has TypeScript types out of the box.
5. **Permissioned model.** Per-call permission grants give users control over what apps can do.

## Migration checklist

1. Add the new packages: `bun add @1sat/react @1sat/actions @1sat/connect @1sat/client @bsv/sdk`
2. Wrap your app in `<WalletProvider>` from `@1sat/react`. Remove any `window.yours` connection logic.
3. Use `<ConnectButton>` and `useWallet()` for connection state. Remove `yours.connect()` calls.
4. Build `ctx` once with `createContext(wallet, { chain: 'main', services })`. Pass it to every action.
5. Replace each `yours.xxx(...)` call with the equivalent `xxx.execute(ctx, { ... })`.
6. For ordinal spend operations (transfer, list, cancel, opns), add the two-step `getOrdinals` → action pattern. See [BEEF](../concepts/beef.md).
7. Move event listeners from `yours.on(...)` to `window.addEventListener('YoursEmitEvent', ...)`.
8. Validate: round-trip a `sendBsv`, an `inscribe`, and a `transferOrdinals` in test.

## See also

- [Quickstart](../quickstart.md)
- [For AI Agents](../ai-onboarding.md)
- [Concept: Actions & Context](../concepts/actions-and-context.md)
- [Concept: BEEF](../concepts/beef.md)
