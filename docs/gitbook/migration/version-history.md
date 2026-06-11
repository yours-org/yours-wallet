---
description: Package versions, breaking changes, and migration notes between releases.
icon: clock-rotate-left
---

# Version History

## Package set

The current Yours Wallet integration depends on the following package versions (synchronized with the production wallet at the time of writing):

```json
{
  "dependencies": {
    "@1sat/react": "0.0.x",
    "@1sat/connect": "0.0.67",
    "@1sat/actions": "0.0.166",
    "@1sat/client": "0.0.38",
    "@1sat/types": "0.0.31",
    "@1sat/utils": "0.0.25",
    "@bsv/sdk": "^2.0.13"
  }
}
```

`@1sat/*` packages are still pre-1.0; minor bumps may include breaking changes. Pin exact versions and review the changelog for each bump.

## What each package provides

- **`@1sat/react`** — React hooks and components: `useWallet`, `WalletProvider`, `ConnectButton`.
- **`@1sat/connect`** — BRC-100 wallet detection. Used internally by `WalletProvider`.
- **`@1sat/actions`** — All the `xxx.execute(ctx, input)` actions plus builder helpers (`buildBurnOrdinals`, `prepareSweepInputs`, etc).
- **`@1sat/client`** — Backend services: `OneSatServices`, `MneeClient`, `BapClient`, `MneeConfig`, `MneeTransferStatus`, `MneeUtxo`.
- **`@1sat/types`** — Shared TypeScript types: `Destination`, `AddressDerivation`, `P1SAT_PROTOCOL`, `CollectionTraits`, etc.
- **`@bsv/sdk`** — Transaction primitives, BRC-100 `WalletInterface`, `PrivateKey`, `Utils`, `Transaction`, `Script`.

## Breaking changes

### Pre-BRC-100 → BRC-100 era

The single largest break in Yours Wallet's history: the move from the `window.yours` injected provider to the BRC-100 `WalletInterface` via `@1sat/actions`. See the [Legacy Provider Migration](./legacy-provider.md) for the full mapping.

### Naming changes from older `@1sat/actions` releases

- `prefix` default for `deriveDepositAddresses` and `syncAddresses` changed to `'1sat'` (was historically variable per wallet). Omit `prefix` to use the default.
- `sendMnee` now requires a `derivations` array (the full objects from `deriveDepositAddresses`), not just addresses.
- BSV-21 amounts are now `bigint | string`; recipients use a `Destination` object (e.g. `{ address }`) rather than a bare address string.
- `Bsv21Balance.all` and `Bsv21Balance.listed` now hold `bigint` values for `confirmed` and `pending`.

## Actions not yet documented

The `@1sat/actions` package exposes additional surface not yet covered by these docs. Consult the SDK source / typings for:

- **Scan helpers**: `scanAddress`, `scanAddresses` — categorize external address UTXOs by type (funding / ordinals / BSV-21 / OpNS / etc).
- **Two-step sweep**: `prepareSweepBsv`, `completeSweep` — build unsigned tx for external signing, then broadcast with signed spends.
- **Cosign backend module**: `prepareCosignBsv21Transfer`, `finalizeCosignBsv21Transfer`, `buildCosignDestination`, `CosignSessionStore`, `InMemoryCosignSessionStore` — for service providers running a cosigner backend, NOT for user wallets. See `@1sat/actions/cosign`.
- **Processed-tx stores**: `ProcessedTxStoreIdb`, `ProcessedTxStoreSqlite` — replay protection for sync flows.
- **AIP / Sigma / BAP signing helpers**: `applyAip`, `applyBapAip`, `signWithBap`, `applySigma`, `resolveCurrentKeyId`, `resolveBapSigner` — used internally by `inscribe` / `updateProfile` / etc; call directly only for custom protocols.
- **Funding providers**: `FundingProvider`, `FundingResult` — advanced funding flows.
- **Utilities**: `signP2PKHInput`, `completeSignedAction`, `createTrackedAction`, `executeTrackedAction`, `resolveBeef`, `extractIdTag`, `internalizeBeef`, `getDisplayValue`.

Submit a PR adding pages for any of these you build against.

## Suggested upgrade workflow

1. Read the changelog for the package being upgraded.
2. Bump one package at a time. Run your test suite against each bump.
3. For breaking releases, expect type errors first — they are easier to diagnose than runtime errors.
4. Validate with a manual `sendBsv` + `getOrdinals` + `transferOrdinals` round-trip on a low-stakes account before deploying.

## See also

- [Packages](../reference/packages.md)
- [Legacy Provider Migration](./legacy-provider.md)
- [Quickstart](../quickstart.md)
