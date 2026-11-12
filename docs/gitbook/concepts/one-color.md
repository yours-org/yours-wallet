---
description: How 1Color (BRC-162) tokens work in Yours Wallet — the BRC-207 color module, its baskets, labels, consent prompts, overlays and handle delivery.
icon: palette
---

# 1Color Tokens

1Color is the BRC-162 fungible token format. A token output is a small locking script that names its asset, its role (`value` or `authority`) and its amount, in front of an ordinary P2PKH lock. A token's overlay (BRC-22) admits each transaction that moves it and answers which outputs are still spendable.

Yours Wallet supports 1Color through a **wallet module**, not through a dApp-facing API of its own. The BRC-207 `color` module (`@bsv/color-permission-module`) sits inside the wallet's permissions manager and intercepts every BRC-100 call that names a `p color` protocol, basket or label. That has a consequence worth stating plainly:

{% hint style="success" %}
A dApp speaks plain BRC-100 to Yours — `createAction`, `signAction`, `listOutputs`, `internalizeAction`, `createSignature`, `getPublicKey` — with 1Color's naming conventions. The wallet selects the token inputs, adds token change, signs, asks the user for consent and submits to the overlay. There is nothing Yours-specific to call.
{% endhint %}

The `@1sat/actions` helpers ([deploy1Color](../actions/deploy-1color.md), [send1Color](../actions/send-1color.md), [syncTransactionInbox](../actions/receive-1color.md)) are convenience wrappers over exactly those calls.

## Identifiers

| Thing              | Form                                                             | Helper (`@bsv/color-permission-module`)                    |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Asset id           | `<txid>_<vout>` of the deploy output (`_0` for SDK deploys)      | —                                                          |
| Asset tag          | the asset id as it appears in protocol and basket names          | `assetTag(assetId)`                                        |
| Value basket       | `p color <assetTag>`                                             | `assetBasket(assetId, 'value')`                            |
| Authority basket   | `p color <assetTag> authority`                                   | `assetBasket(assetId, 'authority')`                        |
| Inventory selector | `p color assets` — every token output across all baskets         | `ASSETS_SELECTOR`                                          |
| Balance selector   | `p color balance <assetTag>` or `… authority`                    | —                                                          |
| Key protocol       | `[2, 'p color <assetTag> <prefix> <suffix>']`, key ID `color`    | `colorProtocolID(assetId, prefix, suffix)`, `COLOR_KEY_ID` |
| Deploy selector    | `ISSUE` in place of an asset id, before the deploy's txid exists | `ISSUE`                                                    |
| Action plan        | labels `p color plan <i> <n> <hex>`                              | `ColorPlan.toLabels(plan)` / `fromLabels`                  |
| Overlay topic      | `tm_color_<assetId>` per asset, `tm_color` for deploys           | `colorTopic(assetId)`                                      |

## The plan

Every token action carries a **plan** in its labels: which assets it touches, which outputs the wallet should keep (with their derivation facts), the operations the transaction performs, and any explicit input, change or sighash positions. The module checks the funded transaction against the plan before it signs.

```ts
import { ColorPlan } from '@bsv/color-permission-module';

const labels = ColorPlan.toLabels({
  version: 1,
  assets: [assetId],
  ownedOutputs: [], // outputs of ours the wallet must file (deploys, receipts)
  operations: [{ assetId, operation: 'transfer' }],
  inputPositions: [],
  changePositions: [],
  sighashTypes: [],
});
```

Operations: `transfer`, `burn`, `deploy-fixed`, `deploy-authority`, `mint`, `authority-split`, `authority-combine`, `authority-transfer`, `authority-end`, `resource`.

{% hint style="warning" %}
Every plan requires `options.randomizeOutputs: false`. The plan names outputs by index, so the wallet must not shuffle them.
{% endhint %}

## How a send goes through

1. The dApp calls `createAction` with the recipient's 1Color output, the plan labels and `randomizeOutputs: false`.
2. The module selects admitted token inputs from the asset's basket, adds token change back to the wallet, supplies the inputs' source transactions in `inputBEEF`, and hands the action to the wallet to fund with satoshis.
3. In `signAction` the module compares the funded transaction to the plan, shows the user a **1Color send prompt** (each asset leg, satoshi totals and fee, the signatures it will release), signs the token inputs and submits the transaction to each asset's overlay topic.
4. A **handoff** is the same call with the BRC-177 label `p nosend expiry seconds <n>` and `noSend: true`. The wallet signs but does not broadcast; the recipient submits. When the selected inputs exceed the amount, the module first broadcasts a split to the exact amount. This is the only `noSend` token action the module allows.

## Receiving

A received token output enters the wallet through `internalizeAction` as a `basket insertion` into the asset's value or authority basket, with BRC-207 **receipt instructions** in `customInstructions` (the sender's derivation prefix and suffix and identity key). The transaction must already be submitted to and admitted by the asset's overlay.

Sends to a BRC-169 handle (`@name@domain`) deliver that receipt through the recipient's messagebox (BRC-232). Yours collects its own `transaction-delivery` box about once a minute, submits each delivery to the asset's overlay and internalizes it, so tokens sent to a handle appear in the wallet without the dApp doing anything. A dApp that receives tokens for its own wallet does the same with [syncTransactionInbox](../actions/receive-1color.md).

## Reading holdings

Reads report wallet state only and never ask the overlay. See [1Color balances](../actions/get-1color-balances.md).

| Tag on an output        | Meaning                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `color_state_available` | Spendable now                                                                                                  |
| `color_state_reserved`  | An input of a pending action (for example an unsent handoff)                                                   |
| `p color <64 hex>`      | SHA-256 of the output's derivation suffix; the module's own bookkeeping, left out of the `p color assets` view |

## Consent and permissions

The module keeps no grants of its own and asks the wallet on every operation. Yours turns those requests into its prompt window and applies these rules:

| Request            | When                                                                 | Yours behaviour                                                                                                      |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `color_access`     | A read of a `p color` basket or `listActions` with `p color` labels  | A stored basket grant for that app and basket approves silently; otherwise one prompt, and approval stores the grant |
| `color_send`       | `signAction` of a token action                                       | Always prompts, with every asset leg, fee and released signature                                                     |
| `color_signature`  | `createSignature` with a `p color` protocol (app-built transactions) | Always prompts, with the same facts                                                                                  |
| `color_relinquish` | `relinquishOutput` of a token output                                 | Always prompts                                                                                                       |

A denied prompt surfaces as `user-rejected` like any other. See [Permissions](permissions.md).

## Overlays

Each asset has an overlay the wallet trusts for spendability, admission and submission. Yours resolves it per asset: the user's override from **Settings → Token overlays**, else the chain default.

| Chain   | Default overlay              |
| ------- | ---------------------------- |
| testnet | `https://testnet.openex.dev` |
| mainnet | none — the user must set one |

{% hint style="warning" %}
On mainnet a token action fails until the user has set an overlay for that asset in Settings → Token overlays. Tell users which overlay your tokens live on.
{% endhint %}

## Feature detection

The module advertises `brc207-color=5` in its permissions manager's version string (BRC-205), but Yours currently answers `getVersion` with `yours-wallet-<extension version>` and does not yet pass that advertisement through. Until it does, treat 1Color as available on every Yours release that ships these docs, and surface the wallet's error if a `p color` call is refused.

## What the module does not do

- It does not hold, create or file BRC-161 JSON outputs (it reads them as inputs).
- It does not validate BRC-176 lineage; it relies on overlay admission.
- It fails rather than falls back on assets whose deploy declares processing profiles, on `profileData`, and on satoshi `changePositions`.

## Related

- [deploy1Color](../actions/deploy-1color.md)
- [send1Color](../actions/send-1color.md)
- [1Color balances](../actions/get-1color-balances.md)
- [Receiving 1Color](../actions/receive-1color.md)
- [Baskets & Tags](baskets-and-tags.md)
- [Permissions](permissions.md)
