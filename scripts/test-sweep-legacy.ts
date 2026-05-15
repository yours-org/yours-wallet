/**
 * Test script for sweepLegacy logic.
 *
 * Usage:
 *   bun run scripts/test-sweep-legacy.ts --check <mnemonic>
 *   bun run scripts/test-sweep-legacy.ts --fund <sats> <mnemonic>
 *   bun run scripts/test-sweep-legacy.ts <mnemonic>
 *   bun run scripts/test-sweep-legacy.ts --broadcast <mnemonic>
 *
 * Modes:
 *   --check       Shows balances for both the wallet address and sweep address.
 *                 Use this first to confirm the wallet has funds before funding.
 *
 *   --fund <sats> Sends <sats> from the wallet address to the sweep address
 *                 so you can test the sweep round-trip. Requires the wallet
 *                 address to have funds.
 *
 *   (default)     Dry run — derives addresses, syncs, queries UTXOs, builds
 *                 the sweep tx, prints everything. Does NOT broadcast.
 *
 *   --broadcast   Builds AND broadcasts the sweep tx for real.
 */

import { P2PKH, SatoshisPerKilobyte, Transaction } from '@bsv/sdk';
import { OneSatServices } from '@1sat/wallet-browser';
import { generateKeysFromTag, getKeys } from '../src/utils/keys';

const SWEEP_PATH = "m/44'/236'/0'/0/0";
const DEFAULT_FEE_RATE = 100;

/** Trigger the 1Sat indexer to process an address, then return its unspent outputs. */
async function syncAndQuery(services: OneSatServices, address: string) {
  console.log(`Syncing ${address}...`);
  for await (const event of services.owner.getTxos(address, { refresh: true, limit: 1 })) {
    if (event.type === 'sync') {
      const p = event.data as { phase?: string; processed?: number; total?: number };
      process.stdout.write(`  sync: ${p.phase ?? 'syncing'} ${p.processed ?? 0}/${p.total ?? '?'}\r`);
    } else if (event.type === 'done' || event.type === 'error') break;
  }
  console.log('  sync complete.                    ');

  return (await services.txo.search(`own:${address}`, { unspent: true, sats: true, limit: 0 })) ?? [];
}

/** Fetch BEEF for each UTXO and add as P2PKH inputs to tx. */
async function addInputsFromUtxos(
  tx: Transaction,
  utxos: { outpoint: string }[],
  privKey: InstanceType<typeof import('@bsv/sdk').PrivateKey>,
  services: OneSatServices,
) {
  let skipped = 0;
  for (const u of utxos) {
    const [txid, voutStr] = u.outpoint.split(/[._]/);
    try {
      const rawTx = await services.beef.getRawTx(txid);
      if (!rawTx.length) {
        console.log(`  SKIP ${txid} — empty response`);
        skipped++;
        continue;
      }
      tx.addInput({
        sourceTransaction: Transaction.fromBinary([...rawTx]),
        sourceOutputIndex: parseInt(voutStr),
        sequence: 0xffffffff,
        unlockingScriptTemplate: new P2PKH().unlock(privKey),
      });
      console.log(`  + ${txid}:${voutStr}`);
    } catch (err) {
      console.log(`  SKIP ${txid} — ${err}`);
      skipped++;
    }
  }
  return skipped;
}

// ─── Check mode ──────────────────────────────────────────────────────────────

async function checkBalances(mnemonic: string) {
  const sweepWallet = generateKeysFromTag(mnemonic, SWEEP_PATH);
  const keys = getKeys(mnemonic);
  const services = new OneSatServices('main');

  console.log('--- Balance Check ---');
  console.log(`Wallet address (destination): ${keys.walletAddress}`);
  console.log(`Sweep address  (SWEEP_PATH):  ${sweepWallet.address}`);
  console.log('');

  const walletUtxos = await syncAndQuery(services, keys.walletAddress);
  const walletSats = walletUtxos.reduce((sum, u) => sum + (u.satoshis ?? 0), 0);

  const sweepUtxos = await syncAndQuery(services, sweepWallet.address);
  const sweepSats = sweepUtxos.reduce((sum, u) => sum + (u.satoshis ?? 0), 0);

  console.log('');
  console.log('  Wallet:  ' + (walletUtxos.length > 0 ? `${walletSats} sats (${walletUtxos.length} UTXOs)` : 'empty'));
  console.log('  Sweep:   ' + (sweepUtxos.length > 0 ? `${sweepSats} sats (${sweepUtxos.length} UTXOs)` : 'empty'));
  console.log('');

  if (walletSats === 0 && sweepSats === 0) {
    console.log('Both addresses are empty. Fund the wallet address first.');
  } else if (walletSats > 0 && sweepSats === 0) {
    console.log('Wallet has funds. Run --fund <sats> to deposit into the sweep address.');
  } else if (sweepSats > 0) {
    console.log('Sweep address has funds. Run without flags for a dry-run sweep.');
  }
}

// ─── Fund mode ───────────────────────────────────────────────────────────────

async function fundSweepAddress(mnemonic: string, sats: number) {
  const sweepWallet = generateKeysFromTag(mnemonic, SWEEP_PATH);
  const keys = getKeys(mnemonic);
  const walletKey = generateKeysFromTag(mnemonic, keys.walletDerivationPath);
  const services = new OneSatServices('main');

  console.log('--- Fund Sweep Address ---');
  console.log(`From (wallet):  ${keys.walletAddress}`);
  console.log(`To (sweep):     ${sweepWallet.address}`);
  console.log(`Amount:         ${sats} sats`);
  console.log('');

  // Sync and query wallet address for funding UTXOs
  const utxos = await syncAndQuery(services, keys.walletAddress);
  const totalAvailable = utxos.reduce((sum, u) => sum + (u.satoshis ?? 0), 0);
  console.log(`Wallet has ${utxos.length} UTXO(s), ${totalAvailable} sats available`);

  if (totalAvailable < sats + 200) {
    console.error(`Not enough funds. Need at least ${sats + 200} sats (amount + fee headroom).`);
    process.exit(1);
  }

  // Build funding tx: send <sats> to sweep address, change back to wallet
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(sweepWallet.address), satoshis: sats });
  tx.addOutput({ lockingScript: new P2PKH().lock(keys.walletAddress), change: true });

  console.log('Building funding tx...');
  const skipped = await addInputsFromUtxos(tx, utxos, walletKey.privKey, services);

  if (tx.inputs.length === 0) {
    console.error('No inputs could be added. Aborting.');
    process.exit(1);
  }

  await tx.fee(new SatoshisPerKilobyte(DEFAULT_FEE_RATE));
  await tx.sign();

  console.log('');
  console.log('Funding tx built:');
  console.log(`  txid:   ${tx.id('hex')}`);
  console.log(`  size:   ${tx.toBinary().length} bytes`);
  console.log(`  sends:  ${sats} sats → ${sweepWallet.address}`);
  console.log('');
  console.log('Broadcasting...');
  const result = await services.arcade.submitTransaction(tx.toBinary());
  console.log('Result:', result);
  console.log('');
  console.log('Sweep address is now funded. Run without --fund to test the sweep.');
}

// ─── Sweep mode ──────────────────────────────────────────────────────────────

async function sweep(mnemonic: string, broadcast: boolean) {
  const sweepWallet = generateKeysFromTag(mnemonic, SWEEP_PATH);
  const keys = getKeys(mnemonic);
  const services = new OneSatServices('main');

  console.log('--- Sweep Legacy Test ---');
  console.log(`Sweep address (SWEEP_PATH): ${sweepWallet.address}`);
  console.log(`Destination (wallet addr):  ${keys.walletAddress}`);
  console.log('');

  const utxos = await syncAndQuery(services, sweepWallet.address);

  if (utxos.length === 0) {
    console.log('No UTXOs found at sweep address. Nothing to sweep.');
    console.log('Tip: run with --fund <sats> first to deposit test funds.');
    process.exit(0);
  }

  const totalSats = utxos.reduce((sum, u) => sum + (u.satoshis ?? 0), 0);
  console.log(`Found ${utxos.length} UTXO(s) totalling ${totalSats} sats`);
  for (const u of utxos) {
    console.log(`  ${u.outpoint}  ${u.satoshis ?? '?'} sats`);
  }
  console.log('');

  console.log('Building sweep tx...');
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(keys.walletAddress), change: true });

  const skipped = await addInputsFromUtxos(tx, utxos, sweepWallet.privKey, services);

  if (tx.inputs.length === 0) {
    console.error('No inputs could be added. Aborting.');
    process.exit(1);
  }

  await tx.fee(new SatoshisPerKilobyte(DEFAULT_FEE_RATE));
  await tx.sign();

  console.log('');
  console.log('Sweep tx built:');
  console.log(`  txid:    ${tx.id('hex')}`);
  console.log(`  inputs:  ${tx.inputs.length} (${skipped} skipped)`);
  console.log(`  size:    ${tx.toBinary().length} bytes`);
  console.log(`  output:  ${tx.outputs[0].satoshis} sats → ${keys.walletAddress}`);

  if (broadcast) {
    console.log('');
    console.log('Broadcasting...');
    const result = await services.arcade.submitTransaction(tx.toBinary());
    console.log('Result:', result);
  } else {
    console.log('');
    console.log('Dry run — not broadcasting. Pass --broadcast to submit.');
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const checkIdx = args.indexOf('--check');
  const fundIdx = args.indexOf('--fund');
  const broadcastIdx = args.indexOf('--broadcast');

  if (checkIdx !== -1) {
    const mnemonic = args
      .filter((a) => a !== '--check')
      .join(' ')
      .trim();
    if (!mnemonic) {
      console.error('Provide a mnemonic after --check.');
      process.exit(1);
    }
    await checkBalances(mnemonic);
  } else if (fundIdx !== -1) {
    const sats = parseInt(args[fundIdx + 1]);
    if (isNaN(sats) || sats < 1) {
      console.error('--fund requires a positive number of sats. e.g. --fund 1000');
      process.exit(1);
    }
    const mnemonic = args
      .filter((_, i) => i !== fundIdx && i !== fundIdx + 1)
      .join(' ')
      .trim();
    if (!mnemonic) {
      console.error('Provide a mnemonic after the flags.');
      process.exit(1);
    }
    await fundSweepAddress(mnemonic, sats);
  } else {
    const shouldBroadcast = broadcastIdx !== -1;
    const mnemonic = args
      .filter((a) => a !== '--broadcast')
      .join(' ')
      .trim();
    if (!mnemonic) {
      console.error('Usage:');
      console.error('  bun run scripts/test-sweep-legacy.ts --check <mnemonic>');
      console.error('  bun run scripts/test-sweep-legacy.ts --fund <sats> <mnemonic>');
      console.error('  bun run scripts/test-sweep-legacy.ts <mnemonic>');
      console.error('  bun run scripts/test-sweep-legacy.ts --broadcast <mnemonic>');
      process.exit(1);
    }
    await sweep(mnemonic, shouldBroadcast);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
