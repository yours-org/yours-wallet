# Yours Wallet Provider API

Integrate Yours Wallet into your web application. Connect to the wallet, read balances, send transactions, manage ordinals, tokens, identity, certificates, encryption, and more.

## Quick Start

```bash
bun add @1sat/react @1sat/actions @1sat/connect @1sat/client
```

```tsx
import { WalletProvider, ConnectButton, useWallet } from '@1sat/react';

function App() {
  return (
    <WalletProvider autoReconnect>
      <ConnectButton connectLabel="Connect Wallet" connectedLabel="Connected" disconnectOnClick />
      <MyApp />
    </WalletProvider>
  );
}

function MyApp() {
  const { wallet, status } = useWallet();
  if (status !== 'connected') return <p>Connect your wallet</p>;
  // Use wallet...
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

### ConnectButton

```tsx
<ConnectButton
  connectLabel="Connect Wallet"
  connectingLabel="Connecting..."
  connectedLabel="Connected"
  disconnectOnClick
/>
```

### Events

```tsx
useEffect(() => {
  const handler = (e: CustomEvent) => {
    const { action } = e.detail;
    if (action === 'signedOut') disconnect();
    if (action === 'switchAccount') {
      disconnect();
      setTimeout(() => connect(), 500);
    }
  };
  window.addEventListener('YoursEmitEvent', handler);
  return () => window.removeEventListener('YoursEmitEvent', handler);
}, []);
```

| Event           | Description                             |
| --------------- | --------------------------------------- |
| `signedOut`     | User signed out in the wallet extension |
| `switchAccount` | User switched to a different account    |

---

## Context & Action Pattern

All wallet operations use `@1sat/actions`. Create a context, then call `action.execute(ctx, input)`.

```tsx
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

```tsx
// Pattern for all actions
const result = await someAction.execute(ctx, { ...input });
if (result.error) throw new Error(result.error);
```

---

## Payments

### Send BSV

```tsx
import { sendBsv } from '@1sat/actions';

const result = await sendBsv.execute(ctx, {
  requests: [
    { address: '1Address...', satoshis: 50000 },
    { address: '1Another...', satoshis: 25000 },
  ],
});
// result: { txid?: string, error?: string }
```

### Send All BSV

```tsx
import { sendAllBsv } from '@1sat/actions';

const result = await sendAllBsv.execute(ctx, {
  destination: '1Address...',
});
```

### List Outputs (UTXOs)

```tsx
// Basic
const { outputs } = await ctx.wallet.listOutputs({
  basket: 'default',
  limit: 1000,
});
const totalSats = outputs.reduce((sum, o) => sum + o.satoshis, 0);

// With locking scripts
const { outputs } = await ctx.wallet.listOutputs({
  basket: 'default',
  include: 'locking scripts',
  limit: 200,
});
```

---

## Ordinals

### List Ordinals

```tsx
import { getOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, { limit: 50 });
```

> **BEEF** (Background Evaluation Extended Format): Contains transaction ancestry needed to spend outputs. You **must** call `getOrdinals` first to get both the output objects and the BEEF, then pass them to transfer/list/cancel operations. BEEF may be `undefined` if there are no ordinals — always check before using.

### Transfer Ordinals

```tsx
import { getOrdinals, transferOrdinals } from '@1sat/actions';

// Step 1: Fetch ordinals + BEEF
const ordsResult = await getOrdinals.execute(ctx, {});
if (!ordsResult.BEEF) throw new Error('No BEEF returned');

// Step 2: Find the ordinal you want to transfer
const ordinal = ordsResult.outputs.find((o) => o.outpoint === targetOutpoint);
if (!ordinal) throw new Error('Ordinal not found');

// Step 3: Transfer with the output object and BEEF
const result = await transferOrdinals.execute(ctx, {
  transfers: [{ ordinal, address: '1Recipient...' }],
  inputBEEF: Array.from(ordsResult.BEEF),
});
```

### Inscribe

```tsx
import { inscribe } from '@1sat/actions';

const result = await inscribe.execute(ctx, {
  base64Content: btoa('Hello, world!'),
  contentType: 'text/plain',
  map: { app: 'my-app', type: 'post' }, // Optional MAP metadata
  signWithBAP: true, // Optional BAP signing
});
```

### Burn Ordinals

```tsx
import { buildBurnOrdinals } from '@1sat/actions';

// Build burn params (returns CreateActionArgs for wallet.createAction)
const args = await buildBurnOrdinals(ctx, {
  ordinals: [output1, output2],
  inputBEEF: Array.from(BEEF),
});
const result = await ctx.wallet.createAction(args);
```

---

## Marketplace (OrdLock)

### List for Sale

```tsx
import { getOrdinals, listOrdinal } from '@1sat/actions';

// Fetch the ordinal + BEEF first
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF returned');
const ordinal = outputs.find((o) => o.outpoint === targetOutpoint);

const result = await listOrdinal.execute(ctx, {
  ordinal,
  inputBEEF: Array.from(BEEF),
  price: 100000, // Price in satoshis
  payAddress: '1Seller...', // Address where payment goes when purchased
});
```

### Purchase

```tsx
import { purchaseOrdinal } from '@1sat/actions';

const result = await purchaseOrdinal.execute(ctx, { outpoint: 'txid.vout' });
```

### Cancel Listing

```tsx
import { getOrdinals, cancelListing } from '@1sat/actions';

// Fetch the listing output + BEEF first
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF returned');
const listing = outputs.find((o) => o.outpoint === listingOutpoint);

const result = await cancelListing.execute(ctx, {
  listing,
  inputBEEF: Array.from(BEEF),
});
```

### Derive Cancel Address

```tsx
import { deriveCancelAddress } from '@1sat/actions';

const result = await deriveCancelAddress.execute(ctx, { outpoint: 'txid.vout' });
```

---

## Collections

### Mint Collection

```tsx
import { mintCollection } from '@1sat/actions';

const result = await mintCollection.execute(ctx, {
  name: 'My Collection',
  description: 'A collection of art',
  base64Content: '...', // Collection cover image
  contentType: 'image/png',
  quantity: 100, // Max items in collection
});
```

### Mint Collection Item

```tsx
import { mintCollectionItem } from '@1sat/actions';

const result = await mintCollectionItem.execute(ctx, {
  name: 'Item #1',
  collectionId: 'txid.vout',
  base64Content: '...',
  contentType: 'image/png',
});
```

---

## BSV-21 Tokens

### Get Balances

```tsx
import { getBsv21Balances } from '@1sat/actions';

const balances = await getBsv21Balances.execute(ctx, {});
// Returns: [{ id, sym, amt, dec, all: { confirmed, pending }, listed: { confirmed, pending } }]
```

### Send Tokens

```tsx
import { sendBsv21 } from '@1sat/actions';

const result = await sendBsv21.execute(ctx, {
  tokenId: 'txid_vout',
  recipients: [{ address: '1Recipient...', amount: '1000' }],
});
```

### List Token Outputs

```tsx
import { listTokens } from '@1sat/actions';

const outputs = await listTokens.execute(ctx, { tokenId: 'txid_vout' });
```

### Purchase Token

```tsx
import { purchaseBsv21 } from '@1sat/actions';

const result = await purchaseBsv21.execute(ctx, {
  tokenId: 'txid_vout',
  outpoint: 'listing-outpoint',
  amount: '1000',
});
```

---

## MNEE Stablecoin

### Derive Addresses

MNEE operations require BRC-29 derived addresses. Derive them once and reuse for balance checks and sends.

```tsx
import { deriveDepositAddresses } from '@1sat/actions';

// derivations = full objects needed for sendMnee
// addresses = just the address strings needed for balance/history
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  prefix: 'yours', // BRC-29 prefix — use 'yours' for Yours Wallet
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map((d) => d.address);
```

### Get Balance

```tsx
import { getMneeBalance } from '@1sat/actions';

const balance = await getMneeBalance.execute(ctx, { addresses });
// balance: { totalDecimal, totalAtomic, balances: [{ address, decimalAmount }] }
```

### Send MNEE

```tsx
import { sendMnee } from '@1sat/actions';

// amount must be a number (not a string) — convert from user input
const result = await sendMnee.execute(ctx, {
  recipients: [{ address: '1Recipient...', amount: Number(userInput) }],
});
// result: { txid?, ticketId?, error? }
```

### Transaction History

```tsx
import { getMneeHistory } from '@1sat/actions';

const res = await getMneeHistory.execute(ctx, { addresses, limit: 20 });
const entries = res.history;
// entries: [{ txid, type: 'send'|'receive', amount, status, height, score, counterparties }]
```

### Transaction Status

```tsx
import { getMneeTxStatus } from '@1sat/actions';

const status = await getMneeTxStatus.execute(ctx, { ticketId: '...' });
```

### MNEE Config

```tsx
import { getMneeConfig } from '@1sat/actions';

const config = await getMneeConfig.execute(ctx, {});
```

### MNEE UTXOs

```tsx
import { getMneeUtxos } from '@1sat/actions';

const utxos = await getMneeUtxos.execute(ctx, { addresses });
```

---

## Identity (BAP)

### Get Profile

```tsx
import { getProfile } from '@1sat/actions';

const result = await getProfile.execute(ctx, {});
// result: { bapId?, profile?: { name, image, description, '@type', ... }, error? }
```

### Publish Identity

```tsx
import { publishIdentity } from '@1sat/actions';

const result = await publishIdentity.execute(ctx, {});
// Creates the initial BAP ID record on-chain
```

### Update Profile

```tsx
import { updateProfile } from '@1sat/actions';

const result = await updateProfile.execute(ctx, {
  profile: { '@type': 'Person', name: 'Alice', image: '1sat://txid.0' },
});
// Auto-publishes identity if not yet published
```

### Rotate Identity Key

```tsx
import { rotateIdentity } from '@1sat/actions';

const result = await rotateIdentity.execute(ctx, {});
```

### Attest

```tsx
import { attest } from '@1sat/actions';

const result = await attest.execute(ctx, {
  attestationHash: 'sha256-hash-of-urn',
  counter: '0',
});
```

### Compute / Resolve BAP ID

```tsx
import { computeBapId, resolveBapId } from '@1sat/actions';

const bapId = await computeBapId(ctx); // Always returns a value
const resolved = await resolveBapId(ctx); // null if not published
```

---

## Locks (Timelock)

### Get Lock Status

```tsx
import { getLockData } from '@1sat/actions';

const lockData = await getLockData.execute(ctx, {});
// lockData: { totalLocked, unlockable, nextUnlock }
```

### Lock BSV

```tsx
import { lockBsv } from '@1sat/actions';

const result = await lockBsv.execute(ctx, {
  requests: [{ satoshis: 100000, until: 900000 }],
});
```

### Unlock

```tsx
import { unlockBsv } from '@1sat/actions';

const result = await unlockBsv.execute(ctx, {});
```

---

## Message Signing & Encryption

### Sign Message (BSM)

```tsx
import { signBsm } from '@1sat/actions';

const result = await signBsm.execute(ctx, { message: 'Hello, world!' });
// result: { sig, address, pubKey, error? }
```

### Authentication Token

```tsx
import { getAuthToken } from '@1sat/actions';

const token = await getAuthToken.execute(ctx, { domain: 'myapp.com' });
```

### Encrypt / Decrypt

```tsx
import { encryptForCounterparty, decryptFromCounterparty } from '@1sat/actions';

// Encrypt a message for a counterparty
const encrypted = await encryptForCounterparty.execute(ctx, {
  counterparty: '02pubkey...',
  message: 'secret message',
});

// Decrypt a message from a counterparty
const decrypted = await decryptFromCounterparty.execute(ctx, {
  counterparty: '02pubkey...',
  ciphertext: encrypted.ciphertext,
});
```

### Friend Public Key

```tsx
import { getFriendPublicKey } from '@1sat/actions';

const result = await getFriendPublicKey.execute(ctx, {
  counterparty: '02pubkey...',
});
```

---

## Social

### Create Post

```tsx
import { createSocialPost } from '@1sat/actions';

const result = await createSocialPost.execute(ctx, {
  content: 'Hello BSV!',
  app: 'my-social-app',
});
```

---

## OpNS Names

### Register

```tsx
import { getOrdinals, opnsRegister } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const ordinal = outputs.find((o) => o.outpoint === opnsOutpoint);

const result = await opnsRegister.execute(ctx, {
  ordinal,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
```

### Deregister

```tsx
import { getOrdinals, opnsDeregister } from '@1sat/actions';

// Fetch the OpNS ordinal + BEEF first
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const opnsOrdinal = outputs.find((o) => o.outpoint === opnsOutpoint);

const result = await opnsDeregister.execute(ctx, {
  ordinal: opnsOrdinal,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
```

### List Names

```tsx
import { getOpnsNames } from '@1sat/actions';

const names = await getOpnsNames.execute(ctx, {});
```

---

## Address Derivation & Sync

### Derive Deposit Addresses

```tsx
import { deriveDepositAddresses } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  prefix: 'yours',
  startIndex: 0,
  count: 5,
});
```

### Sync Addresses

```tsx
import { syncAddresses } from '@1sat/actions';

const result = await syncAddresses.execute(ctx, { prefix: 'yours', count: 5 });
```

---

## Sweep / Import

### Sweep BSV from External Key

```tsx
import { sweepBsv, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

// Prepare inputs from scanned UTXOs
const key = PrivateKey.fromWif('L1abc...');
const inputs = await prepareSweepInputs(ctx, scannedUtxos);

const result = await sweepBsv.execute(ctx, {
  inputs,
  keys: [key],
});
```

### Sweep Ordinals

```tsx
import { sweepOrdinals, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif('L1abc...');
const inputs = await prepareSweepInputs(ctx, scannedUtxos);

const result = await sweepOrdinals.execute(ctx, {
  inputs,
  keys: [key],
});
```

### Sweep BSV-21 Tokens

```tsx
import { sweepBsv21, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif('L1abc...');
const inputs = await prepareSweepInputs(ctx, scannedUtxos);

const result = await sweepBsv21.execute(ctx, {
  inputs,
  keys: [key],
});
```

---

## Low-Level Wallet Interface (BRC-100 CWI)

For advanced use cases, you can call the BRC-100 `WalletInterface` directly via `wallet` from `useWallet()`. These methods are permission-gated — the wallet will prompt the user to approve access.

### Blockchain Queries

```tsx
const { height } = await wallet.getHeight({});
const { header } = await wallet.getHeaderForHeight({ height: 890000 });
const { network } = await wallet.getNetwork({});
const { version } = await wallet.getVersion({});
```

### Key Derivation

```tsx
const { publicKey } = await wallet.getPublicKey({
  protocolID: [1, 'my-protocol'],
  keyID: 'key-1',
  counterparty: '02pubkey...',
  forSelf: false,
});
```

### Transaction Actions

```tsx
// Create a transaction
const result = await wallet.createAction({
  description: 'My transaction',
  outputs: [{ lockingScript: '76a914...88ac', satoshis: 1000, outputDescription: 'payment' }],
  options: { acceptDelayedBroadcast: false },
});

// Sign an externally-created action
const signed = await wallet.signAction({ reference: result.reference, spends: {...} });

// Abort a pending action
await wallet.abortAction({ reference: result.reference });

// Internalize outputs from an external transaction
await wallet.internalizeAction({ tx: beefBytes, outputs: [...], description: 'received payment' });
```

### Cryptographic Operations

```tsx
// Create signature
const { signature } = await wallet.createSignature({
  data: [1, 2, 3],
  protocolID: [1, 'my-protocol'],
  keyID: 'signing-key',
});

// Verify signature
const { valid } = await wallet.verifySignature({
  data: [1, 2, 3],
  signature: [4, 5, 6],
  protocolID: [1, 'my-protocol'],
  keyID: 'signing-key',
  counterparty: '02pubkey...',
});

// HMAC
const { hmac } = await wallet.createHmac({
  data: [1, 2, 3],
  protocolID: [1, 'my-protocol'],
  keyID: 'hmac-key',
});

// Encrypt / Decrypt
const { ciphertext } = await wallet.encrypt({
  plaintext: [72, 101, 108, 108, 111],
  protocolID: [1, 'my-protocol'],
  keyID: 'enc-key',
  counterparty: '02pubkey...',
});

const { plaintext } = await wallet.decrypt({
  ciphertext: [...],
  protocolID: [1, 'my-protocol'],
  keyID: 'enc-key',
  counterparty: '02pubkey...',
});
```

### Certificates

```tsx
// Acquire
const cert = await wallet.acquireCertificate({
  type: 'certificate-type-id',
  certifier: '02certifier-pubkey...',
  acquisitionProtocol: 'direct',
  fields: { name: 'Alice' },
});

// List
const { certificates } = await wallet.listCertificates({
  certifiers: ['02certifier...'],
  types: ['type-id'],
});

// Prove
const proof = await wallet.proveCertificate({
  certificate: cert,
  fieldsToReveal: ['name'],
  verifier: '02verifier-pubkey...',
});

// Relinquish
await wallet.relinquishCertificate({ type: 'type-id', serialNumber: cert.serialNumber, certifier: cert.certifier });
```

### Discovery

```tsx
// Find by identity key
const results = await wallet.discoverByIdentityKey({
  identityKey: '02pubkey...',
  limit: 10,
});

// Find by attributes
const results = await wallet.discoverByAttributes({
  attributes: { name: 'Alice' },
  limit: 10,
});
```

### Key Linkage

```tsx
// Reveal counterparty key linkage
const linkage = await wallet.revealCounterpartyKeyLinkage({
  counterparty: '02pubkey...',
  verifier: '02verifier...',
});

// Reveal specific key linkage
const linkage = await wallet.revealSpecificKeyLinkage({
  counterparty: '02pubkey...',
  verifier: '02verifier...',
  protocolID: [1, 'my-protocol'],
  keyID: 'key-1',
});
```

### Output Management

```tsx
// List outputs with tags
const { outputs } = await wallet.listOutputs({
  basket: 'my-basket',
  tags: ['type:data'],
  includeTags: true,
  limit: 100,
});

// Relinquish an output
await wallet.relinquishOutput({
  basket: 'my-basket',
  output: 'txid.vout',
});
```

### Action History

```tsx
const { actions } = await wallet.listActions({
  labels: ['my-label'],
  limit: 50,
});
```

---

## Types

### WalletOutput

```typescript
interface WalletOutput {
  outpoint: string; // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];
  labels?: string[];
  lockingScript?: string; // Populated when include: 'locking scripts'
  customInstructions?: string;
}
```

### Ordinal Tags

| Tag                 | Meaning                                        |
| ------------------- | ---------------------------------------------- |
| `origin` (bare)     | This output IS the origin inscription          |
| `origin:<outpoint>` | Transfer — use tag's outpoint for content URLs |
| `type:<mime>`       | Content type (e.g. `image/png`)                |
| `name:<string>`     | Friendly name                                  |

### Content URLs

```tsx
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';
const contentUrl = `${ONESAT_MAINNET_CONTENT_URL}/${originOutpoint}`;
```

### Utility Functions

```tsx
import { Utils } from '@bsv/sdk';
const base64 = Utils.toBase64(new TextEncoder().encode('Hello'));

import { MneeClient } from '@1sat/client';
const formatted = MneeClient.fromAtomicAmount(atomicAmount);
```

---

## Error Handling

All actions return `{ error?: string }` on failure. Wrap calls in try/catch for network errors:

```tsx
try {
  const result = await sendBsv.execute(ctx, { ... });
  if (result.error) {
    console.error(result.error);  // Action-level error
    return;
  }
  console.log('Success:', result.txid);
} catch (err) {
  if (err?.code === 'storage-payment-failed') {
    // User needs more BSV to cover storage costs
  }
  console.error(err instanceof Error ? err.message : String(err));
}
```

---

## Packages

| Package         | Purpose                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| `@1sat/react`   | React hooks (`useWallet`), components (`WalletProvider`, `ConnectButton`) |
| `@1sat/connect` | Wallet detection and BRC-100 connection                                   |
| `@1sat/actions` | Action execution (send, inscribe, lock, identity, tokens, etc.)           |
| `@1sat/client`  | Backend services (`OneSatServices`, `MneeClient`, `BapClient`)            |
| `@bsv/sdk`      | BSV transaction library, `WalletInterface`, `AuthFetch`                   |

---

## Full Example

Working test app: [test-1sat-sdk](https://github.com/b-open-io/1sat-sdk/tree/master/test-1sat-sdk)

```tsx
import { WalletProvider, ConnectButton, useWallet } from '@1sat/react';
import { createContext, sendBsv } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';
import { useMemo, useState } from 'react';

const services = new OneSatServices('main');

function App() {
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

  if (!ctx) return <p>Connect your wallet to send BSV</p>;

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
