---
description: Open-source non-custodial BSV wallet built on BRC-100. dApps integrate via @1sat/actions.
icon: house
---

# Yours Wallet

Yours Wallet is an open-source, non-custodial BSV wallet delivered as a Chrome extension. It manages BSV, 1Sat Ordinals, BSV-21 tokens, MNEE stablecoin, and on-chain BAP identity. It is built on the [BRC-100](concepts/brc-100.md) wallet standard.

dApps integrate via the `@1sat/actions` package using a uniform pattern: create a context once, then call `action.execute(ctx, input)` for every operation.

## Read this if you are an AI agent

The fast path:

1. Read [For AI Agents](ai-onboarding.md) for the mental model in ~150 lines.
2. Read [Quickstart](quickstart.md) for the copy-paste boilerplate.
3. Use the [Actions](#actions) index below to find the contract for what you are building.

## Key features

- Non-custodial: keys are encrypted and stored locally; they never leave the device.
- BRC-100 architecture: standard wallet interface with invoices, output tracking, certificates.
- Remote storage: optional backup of transaction history to a [BRC-100 storage server](https://github.com/yours-org/yours-wallet/blob/main/docs/remote-storage-provider.md) for multi-device sync.
- On-chain identity: publish a BAP profile (name, avatar, bio) directly to the blockchain.
- Multi-account: switch between accounts within a single wallet.
- Ordinals: view, transfer, list, cancel listings, mint collections, inscribe.
- BSV-21 tokens: balances and sends with full atomic precision.
- MNEE stablecoin: native send / receive via P1SAT-derived addresses (default keyID prefix `'1sat'`).

## Navigation

### Concepts

The five things you must understand to use the SDK correctly:

- [BRC-100](concepts/brc-100.md) — what the wallet interface is
- [BEEF](concepts/beef.md) — why ordinal operations need to fetch first
- [Actions & Context](concepts/actions-and-context.md) — the `createContext` + `.execute(ctx, input)` pattern
- [Baskets & Tags](concepts/baskets-and-tags.md) — how outputs are organized
- [Derivations](concepts/derivations.md) — P1SAT derived addresses for MNEE (default prefix `'1sat'`)
- [Permissions](concepts/permissions.md) — every operation may prompt the user

### Actions

The high-level API surface. Each action is documented on its own page with input / output types, preconditions, permission prompts, runnable example, pitfalls, and error codes.

Use the [SUMMARY](SUMMARY.md) sidebar for the complete index, or jump to:

- Payments — [sendBsv](actions/send-bsv.md), [sendAllBsv](actions/send-all-bsv.md), [listOutputs](actions/list-outputs.md)
- Ordinals — [getOrdinals](actions/get-ordinals.md), [transferOrdinals](actions/transfer-ordinals.md), [inscribe](actions/inscribe.md), [burnOrdinals](actions/burn-ordinals.md)
- Marketplace — [listOrdinal](actions/list-ordinal.md), [purchaseOrdinal](actions/purchase-ordinal.md), [cancelListing](actions/cancel-listing.md)
- BSV-21 — [getBsv21Balances](actions/get-bsv21-balances.md), [sendBsv21](actions/send-bsv21.md)
- MNEE — [deriveDepositAddresses](actions/derive-deposit-addresses.md), [sendMnee](actions/send-mnee.md), [getMneeBalance](actions/get-mnee-balance.md)
- Identity — [getProfile](actions/get-profile.md), [updateProfile](actions/update-profile.md), [publishIdentity](actions/publish-identity.md)
- Signing — [signBsm](actions/sign-bsm.md), [Encrypt / Decrypt](actions/encrypt-decrypt.md)

### Low-level (BRC-100)

For advanced use cases, the BRC-100 `WalletInterface` is exposed directly via `wallet` from `useWallet()`. See [Low-Level](low-level/blockchain-queries.md) for the raw `wallet.*` methods.

### Cookbook

Task-oriented end-to-end recipes:

- [Mint & List Ordinal](cookbook/mint-and-list-ordinal.md)
- [Sweep Paper Wallet](cookbook/sweep-paper-wallet.md)
- [MNEE Send Flow](cookbook/mnee-send-flow.md)
- [BAP Identity Setup](cookbook/bap-identity-setup.md)

### Migration

If you are upgrading from the legacy `window.yours` injected provider, start at the [Legacy Provider Migration](migration/legacy-provider.md) table.

### Reference

- [Errors](reference/errors.md) — catalog of error codes
- [Types](reference/types.md) — `WalletOutput`, `WalletStatus`, BEEF, tags
- [Packages](reference/packages.md) — install map
- [Events](reference/events.md) — `YoursEmitEvent` details

## Source

- Wallet repo: [github.com/yours-org/yours-wallet](https://github.com/yours-org/yours-wallet)
- SDK repo: [github.com/b-open-io/1sat-sdk](https://github.com/b-open-io/1sat-sdk)
- Test app: [test-1sat-sdk](https://github.com/b-open-io/1sat-sdk/tree/master/test-1sat-sdk)

## License

MIT.
