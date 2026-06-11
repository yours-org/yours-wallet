---
description: Install, connect, and send BSV in under 30 seconds.
icon: rocket
---

# Quickstart

## Install

```bash
bun add @1sat/react @1sat/actions @1sat/connect @1sat/client @bsv/sdk
```

## Wrap your app

```tsx
import { WalletProvider, ConnectButton } from '@1sat/react';

export default function App() {
  return (
    <WalletProvider autoReconnect>
      <ConnectButton
        connectLabel="Connect Wallet"
        connectingLabel="Connecting..."
        connectedLabel="Connected"
        disconnectOnClick
      />
      <MyApp />
    </WalletProvider>
  );
}
```

`WalletProvider` auto-detects any installed BRC-100 wallet (Yours Wallet, etc.). `ConnectButton` handles the connect / disconnect UI.

## Read connection state

```tsx
import { useWallet } from '@1sat/react';

function MyApp() {
  const { wallet, status, identityKey } = useWallet();
  if (status !== 'connected') return <p>Connect your wallet</p>;
  return <p>Connected as {identityKey}</p>;
}
```

`status` values: `'disconnected' | 'detecting' | 'selecting' | 'connecting' | 'connected'`.

## Build a context

Every `@1sat/actions` call needs a context. Build it once with `useMemo`:

```tsx
import { useMemo } from 'react';
import { createContext } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');

function useOneSatContext() {
  const { wallet, status } = useWallet();
  return useMemo(() => {
    if (status !== 'connected' || !wallet) return null;
    return createContext(wallet, { chain: 'main', services });
  }, [wallet, status]);
}
```

## Send BSV

```tsx
import { sendBsv } from '@1sat/actions';

async function send(ctx: any, address: string, satoshis: number) {
  const result = await sendBsv.execute(ctx, {
    requests: [{ address, satoshis }],
  });
  if (result.error) throw new Error(result.error);
  return result.txid;
}
```

{% hint style="info" %}
`satoshis` must be an integer. Multiple `requests` in one call share a single transaction.
{% endhint %}

## Full minimal example

```tsx
import { useMemo, useState } from 'react';
import { WalletProvider, ConnectButton, useWallet } from '@1sat/react';
import { createContext, sendBsv } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');

export default function App() {
  return (
    <WalletProvider autoReconnect>
      <ConnectButton connectLabel="Connect" connectedLabel="Connected" disconnectOnClick />
      <SendForm />
    </WalletProvider>
  );
}

function SendForm() {
  const { wallet, status } = useWallet();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');

  const ctx = useMemo(() => {
    if (status !== 'connected' || !wallet) return null;
    return createContext(wallet, { chain: 'main', services });
  }, [wallet, status]);

  if (!ctx) return <p>Connect your wallet</p>;

  const handleSend = async () => {
    const result = await sendBsv.execute(ctx, {
      requests: [{ address, satoshis: Number(amount) }],
    });
    if (result.error) alert(result.error);
    else alert(`Sent! txid: ${result.txid}`);
  };

  return (
    <div>
      <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      <input placeholder="Satoshis" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
```

## Next steps

- [For AI Agents](ai-onboarding.md) — the mental model in 150 lines
- [Actions & Context](concepts/actions-and-context.md) — deeper on the pattern
- [BEEF](concepts/beef.md) — why ordinal ops have a two-step flow
- [Cookbook](cookbook/mint-and-list-ordinal.md) — end-to-end recipes
- Working test app: [test-1sat-sdk](https://github.com/b-open-io/1sat-sdk/tree/master/test-1sat-sdk)
