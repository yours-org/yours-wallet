![Example Image](/public/banner.png)

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<a href="https://chromewebstore.google.com/detail/yours-wallet/mlbnicldlpdimbjdcncnklfempedeipj" target="_blank">Download Chrome Extension</a>

# Yours Wallet

Open-source, non-custodial BSV wallet built on BRC-100. Chrome extension with multi-device sync, on-chain identity, and ordinal support.

## What It Does

Yours Wallet manages BSV, 1Sat Ordinals, BSV-21 tokens, and MNEE stablecoins from a single Chrome extension. It uses the BRC-100 wallet standard for transaction management, which means your wallet tracks both your keys and your transaction history to locate assets on-chain.

### Key Features

- **Non-custodial** — Private keys are encrypted and stored locally. They never leave your device.
- **BRC-100 architecture** — Modern transaction system with invoices, output tracking, and certificate management.
- **Remote storage** — Back up your transaction history to a remote server. Sync across multiple devices with the same keys. Choose from known providers or run your own.
- **On-chain identity** — Publish a BAP identity profile (name, avatar, bio) directly to the blockchain.
- **Multi-account** — Manage multiple accounts from a single wallet.
- **1Sat Ordinals** — View, transfer, list, and cancel listings. Multi-select with mode locking (transfer or cancel, not both).
- **BSV-21 tokens** — View balances, send tokens with full decimal precision.
- **MNEE stablecoin** — Native MNEE USD support with send and receive.

## Architecture

```
Chrome Extension (popup UI)
  ├── React + Framer Motion frontend
  ├── CWI → background service worker (BRC-100 wallet interface)
  └── @1sat/actions (send, inscribe, lock, identity, etc.)

Background Service Worker
  ├── @1sat/wallet-browser (wallet factory)
  ├── @bsv/wallet-toolbox-mobile (storage, sync, monitor)
  ├── WalletPermissionsManager (BRC-100 permission grants)
  └── Remote storage (active + backup via wallet-toolbox)
```

### Storage Model

Your wallet data lives in one **active** storage location and can be backed up to additional **backup** remotes:

- **Local (default)** — Browser IndexedDB. Data lives only on this device.
- **Remote active** — A BRC-100 storage server. All devices with your keys sync here. Enables multi-device access.
- **Remote backups** — Copies of your data on additional servers for safety.

New wallets start local-only. Users add remotes from the provider list or enter a custom URL.

### Payment for Storage

Storage uses metered pricing. Each provider offers free baseline capacity (typically 1 GB). Usage beyond that is billed in satoshis per GB. Payments happen transparently — the SDK catches HTTP 507 responses and auto-pays via BRC-29 derivation. Users consent once during onboarding; after that, it's invisible.

## Becoming a Storage Provider

Anyone can run a BRC-100 storage server using the `1sat serve` command. Offer free community storage, run a paid service, or just host your own personal backup.

```bash
bunx @1sat/cli init
1sat config set server.accounts.enabled true
1sat config set server.accounts.baselineBytes 1073741824  # 1 GB free
1sat serve
```

See the full guide: **[Remote Storage Provider Guide](docs/remote-storage-provider.md)**

To appear in the wallet's provider picker, submit a PR adding your server to `src/components/ProviderPicker.tsx`.

## Development

### Prerequisites

- [Bun](https://bun.sh)
- Chrome browser

### Setup

```bash
git clone https://github.com/yours-org/yours-wallet.git
cd yours-wallet
bun install
bun run build
```

### Loading in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** and select the `build/` folder

> **WARNING:** If you have the production Yours Wallet installed from the Chrome Web Store, **disable it first**. Running two instances simultaneously causes conflicts — duplicate popups, message collisions, and broken behavior. Toggle the store version off in `chrome://extensions/` before loading your dev build.

After code changes, run `bun run build` again and click the reload icon on the extension card in `chrome://extensions/`.

### Project Structure

```
src/
  ├── background.ts          # Service worker (wallet lifecycle, message handling)
  ├── initWallet.ts           # Wallet factory (createWebWallet, storage config)
  ├── pages/
  │   ├── BsvWallet.tsx       # Main wallet view (balances, send, receive)
  │   ├── OrdWallet.tsx       # Ordinals grid with selection modes
  │   ├── Settings.tsx        # Settings (identity, backup, accounts)
  │   └── StorageStatus.tsx   # Remote storage management UI
  ├── components/
  │   ├── BackupPromo.tsx     # Onboarding walkthrough (keys + backup)
  │   ├── ProviderPicker.tsx  # Known providers + custom remote entry
  │   └── AvatarPicker.tsx    # Profile image (upload or pick from ordinals)
  ├── hooks/
  │   ├── useIdentity.ts      # BAP identity (publish, update, inscribe avatar)
  │   └── useRemoteStatus.ts  # Live /account/status from known providers
  └── docs/
      └── remote-storage-provider.md  # Provider setup guide
```

### Provider API

Integrate Yours Wallet into your dApp: **[Provider API Documentation](docs/provider-api.md)**

Covers connection, sending BSV, ordinals, tokens, MNEE, identity, locks, message signing, and marketplace operations. Working example app: [test-1sat-sdk](https://github.com/b-open-io/1sat-sdk/tree/master/test-1sat-sdk)

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Issues, Features, and PRs

Found a bug or want a feature? Fix it yourself with the help of an AI agent.

The **[Contributing with Agents](docs/contributing-with-agents.md)** guide gives AI coding assistants (Claude Code, Cursor, Copilot, etc.) the full context they need to understand the codebase, make changes, and submit a PR. Point your agent at that doc and describe what you want — it has the architecture, conventions, key files, and common patterns.

```
# Example: have your agent fix an issue
"Read docs/contributing-with-agents.md, then fix issue #123"
```

Or [create an issue](https://github.com/yours-org/yours-wallet/issues) and the team will get to it.

## Contact

- [@yoursxbt on X](https://twitter.com/yoursxbt)
- [Discord](https://discord.gg/qHs6hTkmsf)

## License

[MIT License](https://opensource.org/licenses/MIT)
