---
description: Get the active MNEE service configuration (cosigner, fees, etc).
icon: gear
---

# getMneeConfig

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
getMneeConfig.execute(ctx: OneSatContext, input: {}): Promise<MneeConfig>
```

## Input

```ts
type GetMneeConfigInput = {};
```

## Output

`MneeConfig` is exported from `@1sat/client`. It includes:

- Cosigner public key
- Service fee schedule
- Decimal places for the token
- Settlement endpoints

See `@1sat/client` types for the full shape.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getMneeConfig } from '@1sat/actions';

const config = await getMneeConfig.execute(ctx, {});
console.log(config);
```

## Use cases

- Inspect MNEE configuration before showing send UI
- Read fee schedule for cost estimation
- Validate the wallet's MNEE module is using the expected mainnet config

## Related

- [sendMnee](./send-mnee.md)
- [getMneeBalance](./get-mnee-balance.md)
- [Concept: Derivations](../concepts/derivations.md)
