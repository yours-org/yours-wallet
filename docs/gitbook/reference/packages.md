---
description: Install commands and package responsibilities for the Yours Wallet integration stack.
icon: cubes
---

# Packages

## Install

```bash
bun add @1sat/react @1sat/actions @1sat/connect @1sat/client @1sat/types @1sat/templates @bsv/color-permission-module @bsv/sdk
```

## Package map

| Package                        | Purpose                    | Key exports                                                                                                                          |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@1sat/react`                  | React hooks and components | `useWallet`, `WalletProvider`, `ConnectButton`                                                                                       |
| `@1sat/connect`                | BRC-100 wallet detection   | (used internally by `WalletProvider`)                                                                                                |
| `@1sat/actions`                | Action execution           | `createContext`, `sendBsv`, `getOrdinals`, `inscribe`, `signBsm`, `sendMnee`, `lockBsv`, `deriveDepositAddresses`, ...               |
| `@1sat/client`                 | Backend services           | `OneSatServices`, `MneeClient`, `BapClient`, types: `MneeConfig`, `MneeTransferStatus`, `MneeUtxo`                                   |
| `@1sat/types`                  | Shared TypeScript types    | `Destination`, `AddressDerivation`, `P1SAT_PROTOCOL`, `CollectionTraits`, etc.                                                       |
| `@bsv/sdk`                     | BSV transaction library    | `WalletInterface`, `AuthFetch`, `PrivateKey`, `Utils`, `Transaction`, `Script`                                                       |
| `@1sat/templates`              | Script templates           | `OneColor` (decode / build BRC-162 outputs), ordinal and token templates                                                             |
| `@bsv/color-permission-module` | 1Color naming helpers      | `ColorPlan`, `assetBasket`, `colorProtocolID`, `ASSETS_SELECTOR`, `ISSUE`, `COLOR_KEY_ID` (the module itself runs inside the wallet) |

## Current pinned versions (production)

```json
{
  "dependencies": {
    "@1sat/react": "0.1.1",
    "@1sat/connect": "0.1.1",
    "@1sat/actions": "0.1.2",
    "@1sat/client": "0.1.1",
    "@1sat/types": "0.1.1",
    "@1sat/utils": "0.1.1",
    "@1sat/templates": "0.1.1",
    "@bsv/color-permission-module": "0.1.0",
    "@bsv/sdk": "^4.0.0"
  }
}
```

`@1sat/*` is pre-1.0 — pin exact versions and review the changelog before bumping. See [Version History](../migration/version-history.md).

## Typical imports

### Connection

```tsx
import { WalletProvider, ConnectButton, useWallet } from '@1sat/react';
```

### Action setup

```tsx
import { createContext, sendBsv, getOrdinals, transferOrdinals } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');
```

### Sweep / low-level

```tsx
import { PrivateKey, Utils } from '@bsv/sdk';
import { prepareSweepInputs, sweepBsv } from '@1sat/actions';
```

### Low-level BRC-100

```tsx
import { useWallet } from '@1sat/react';
const { wallet } = useWallet();   // implements WalletInterface from @bsv/sdk

await wallet.getHeight({});
await wallet.createAction({ description: '...', outputs: [...] });
```

### 1Color

```tsx
import { deploy1Color, send1Color, syncTransactionInbox } from '@1sat/actions';
import { ASSETS_SELECTOR, ColorPlan, assetBasket } from '@bsv/color-permission-module';
import { OneColor } from '@1sat/templates';
```

### Shared types

```tsx
import type { Destination, AddressDerivation } from '@1sat/types';
```

## Why bun

Yours Wallet uses `bun` for install and scripts — faster than npm/pnpm for this dependency tree. If your environment requires npm or pnpm, both should work — but the recommended command is `bun`.

## See also

- [Quickstart](../quickstart.md)
- [Version History](../migration/version-history.md)
- [For AI Agents](../ai-onboarding.md)
