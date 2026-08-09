# Yours Wallet Provider API

Integrate Yours Wallet into your web application. Connect to the wallet, read balances, send transactions, manage ordinals, tokens, identity, certificates, encryption, and more.

## Browser Compatibility Notes
- **Recommended Browsers**: Chrome ≥114, Brave ≥1.50, Edge ≥114 (MV3 support)
- **Extension Required**: Yours Wallet v5.0.2+ installed
- **Test Setup**:
  ```bash
  bun add @1sat/react @1sat/actions @1sat/connect @1sat/client
  ```

## Quick Start

```bash
bun add @1sat/react @1sat/actions @1sat/connect @1sat/client
```

```tsx
import { WalletProvider, ConnectButton, useWallet } from '@1sat/react';

function App() {
  return (
    <WalletProvider autoReconnect>
      <ConnectButton
        connectLabel="Connect Yours Wallet"
        connectedLabel="Connected"
        disconnectOnClick
      />
      <WalletStatusDisplay />
    </WalletProvider>
  );
}

function WalletStatusDisplay() {
  const { status, providerType } = useWallet();

  return (
    <div className="mt-4 p-4 bg-gray-100 rounded">
      <h3 className="font-bold">Connection Status</h3>
      <p>Status: {status}</p>
      {providerType && <p>Provider: {providerType}</p>}
    </div>
  );
}
```

---

## Connection

### WalletProvider
Wrap your app in `WalletProvider` from `@1sat/react`. It auto-detects BRC-100 compatible wallets.

```tsx
<WalletProvider autoReconnect>{children}</WalletProvider>
```

### useWallet Hook
```tsx
const {
  wallet, // WalletInterface (BRC-100) — null when disconnected
  status, // 'disconnected' | 'detecting' | 'selecting' | 'connecting' | 'connected'
  providerType, // Provider name (e.g. 'yours-wallet') — null when disconnected
  identityKey, // User's public identity key (when connected)
  connect, // () => Promise<void>
  disconnect, // () => void
} = useWallet();
```

[Остальной существующий контент файла остаётся без изменений]