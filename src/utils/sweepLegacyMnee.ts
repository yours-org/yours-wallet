/**
 * Sweep MNEE from a legacy (pre-BRC-100) address to a BRC-29 derived address.
 *
 * The legacy wallet used simple BIP32 derivation paths, so MNEE UTXOs at those
 * addresses can't be signed with BRC-29 keys. This utility signs with the raw
 * legacy PrivateKey instead, then submits to the MNEE cosigner API.
 *
 * No dependency on @mnee/ts-sdk — uses @1sat/client MneeClient directly.
 */
import {
  BigNumber,
  ECDSA,
  Hash,
  LockingScript,
  OP,
  PrivateKey,
  PublicKey,
  Script,
  Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
} from '@bsv/sdk';
import type { MneeClient, MneeConfig, MneeUtxo } from '@1sat/client';

// ─── Cosign tx helpers (mirrored from @1sat/actions/mnee) ────

function cosignLock(userAddress: string, approverPubKey: PublicKey): LockingScript {
  const hash = Utils.fromBase58Check(userAddress);
  const pkhash = hash.data as number[];
  const script = new LockingScript();
  script
    .writeOpCode(OP.OP_DUP)
    .writeOpCode(OP.OP_HASH160)
    .writeBin(pkhash)
    .writeOpCode(OP.OP_EQUALVERIFY)
    .writeOpCode(OP.OP_CHECKSIGVERIFY)
    .writeBin(approverPubKey.encode(true) as number[])
    .writeOpCode(OP.OP_CHECKSIG);
  return script;
}

function applyInscription(
  lockingScript: LockingScript,
  inscription: { dataB64: string; contentType: string },
): LockingScript {
  const ordHex = Utils.toHex(Utils.toArray('ord', 'utf8'));
  const fileHex = Utils.toHex(Utils.toArray(inscription.dataB64, 'base64'));
  const mimeHex = Utils.toHex(Utils.toArray(inscription.contentType, 'utf8'));
  const ordAsm = `OP_0 OP_IF ${ordHex} OP_1 ${mimeHex} OP_0 ${fileHex} OP_ENDIF`;
  return LockingScript.fromASM(`${ordAsm} ${lockingScript.toASM()}`);
}

function createInscriptionOutput(
  recipient: string,
  atomicAmount: number,
  config: MneeConfig,
): { lockingScript: LockingScript; satoshis: number } {
  const inscriptionData = {
    p: 'bsv-20',
    op: 'transfer',
    id: config.tokenId,
    amt: atomicAmount.toString(),
  };
  const dataB64 = Utils.toBase64(Utils.toArray(JSON.stringify(inscriptionData), 'utf8'));
  const cosignScript = cosignLock(recipient, PublicKey.fromString(config.approver));
  return {
    lockingScript: applyInscription(cosignScript, {
      dataB64,
      contentType: 'application/bsv-20',
    }),
    satoshis: 1,
  };
}

/** Sign a cosign input with a raw PrivateKey (legacy path — no BRC-29). */
function signCosignInputLegacy(tx: Transaction, inputIndex: number, privateKey: PrivateKey): string {
  const input = tx.inputs[inputIndex];
  const sourceLockingScript = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.lockingScript;
  if (!sourceLockingScript) throw new Error(`Missing source locking script for input ${inputIndex}`);

  const sourceTXID = input.sourceTXID ?? input.sourceTransaction?.id('hex');
  if (!sourceTXID) throw new Error(`Missing source TXID for input ${inputIndex}`);

  const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis ?? 1;

  const scope =
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_ANYONECANPAY | TransactionSignature.SIGHASH_FORKID;

  const preimage = TransactionSignature.format({
    sourceTXID,
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis,
    transactionVersion: tx.version,
    otherInputs: tx.inputs
      .filter((_, idx) => idx !== inputIndex)
      .map((inp) => ({
        sourceTXID: inp.sourceTXID ?? inp.sourceTransaction?.id('hex') ?? '',
        sourceOutputIndex: inp.sourceOutputIndex,
        sequence: inp.sequence ?? 0xffffffff,
      })),
    inputIndex,
    outputs: tx.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: sourceLockingScript,
    lockTime: tx.lockTime,
    scope,
  });

  const sighash = Hash.sha256(Hash.sha256(preimage));
  const signature = ECDSA.sign(new BigNumber(sighash), privateKey, true);
  const sigDER = signature.toDER() as number[];
  const sigWithHashtype = [...sigDER, scope];
  const pubKeyBytes = privateKey.toPublicKey().encode(true) as number[];

  return new UnlockingScript().writeBin(sigWithHashtype).writeBin(pubKeyBytes).toHex();
}

// ─── Public API ──────────────────────────────────────────────

export interface SweepLegacyMneeInput {
  /** The MneeClient instance (from apiContext.services.mnee) */
  mneeClient: MneeClient;
  /** Legacy private key (from walletWif) */
  legacyPrivateKey: PrivateKey;
  /** BRC-29 derived destination address */
  destinationAddress: string;
  /** Optional progress callback */
  onProgress?: (message: string) => void;
}

export interface SweepLegacyMneeResult {
  txid?: string;
  ticketId?: string;
  /** Amount swept in MNEE (decimal) */
  amount?: number;
  error?: string;
}

/**
 * Check if a legacy address has MNEE balance.
 * Returns the decimal balance, or 0 if none.
 */
export async function getLegacyMneeBalance(mneeClient: MneeClient, legacyAddress: string): Promise<number> {
  try {
    const balances = await mneeClient.getBalances([legacyAddress]);
    return balances.reduce((sum, b) => sum + b.precised, 0);
  } catch (err) {
    console.error('[getLegacyMneeBalance]', err);
    return 0;
  }
}

/**
 * Sweep all MNEE from a legacy address to a BRC-29 destination.
 */
export async function sweepLegacyMnee(input: SweepLegacyMneeInput): Promise<SweepLegacyMneeResult> {
  const { mneeClient, legacyPrivateKey, destinationAddress, onProgress } = input;
  const legacyAddress = legacyPrivateKey.toPublicKey().toAddress();

  try {
    onProgress?.('Fetching MNEE configuration...');
    const config = await mneeClient.getConfig();
    if (!config?.approver) return { error: 'Failed to get MNEE config' };

    // Get all UTXOs at legacy address
    onProgress?.('Scanning legacy address...');
    const allUtxos = await mneeClient.getAllUtxos([legacyAddress]);
    if (!allUtxos.length) return { error: 'No MNEE found at legacy address' };

    // Sum total tokens
    let tokensIn = 0;
    for (const utxo of allUtxos) {
      tokensIn += utxo.data.bsv21?.amt ?? 0;
    }
    if (tokensIn <= 0) return { error: 'No MNEE token balance at legacy address' };

    // Calculate fee (sweep entire balance to one address)
    const fee = config.fees.find((f) => tokensIn >= f.min && tokensIn <= f.max)?.fee ?? 0;
    const sweepAmount = tokensIn - fee;
    if (sweepAmount <= 0) return { error: 'MNEE balance too small to cover fees' };

    // Build transaction
    onProgress?.('Building transaction...');
    const tx = new Transaction(1, [], [], 0);

    // Add inputs — fetch source txs from MNEE API
    for (const utxo of allUtxos) {
      const rawHex = await mneeClient.fetchRawTx(utxo.txid);
      if (!rawHex) return { error: `Failed to fetch source tx: ${utxo.txid}` };

      const sourceTx = Transaction.fromHex(rawHex);
      tx.addInput({
        sourceTXID: utxo.txid,
        sourceOutputIndex: utxo.vout,
        sourceTransaction: sourceTx,
        unlockingScript: new UnlockingScript(),
        sequence: 0xffffffff,
      });
    }

    // Recipient output (sweep amount → new BRC-29 address)
    tx.addOutput(createInscriptionOutput(destinationAddress, sweepAmount, config));

    // Fee output
    if (fee > 0) {
      tx.addOutput(createInscriptionOutput(config.feeAddress, fee, config));
    }

    // Sign each input with the legacy key
    onProgress?.('Signing transaction...');
    for (let i = 0; i < tx.inputs.length; i++) {
      const unlockingHex = signCosignInputLegacy(tx, i, legacyPrivateKey);
      tx.inputs[i].unlockingScript = UnlockingScript.fromHex(unlockingHex);
    }

    // Submit to MNEE for cosigner signature + broadcast
    onProgress?.('Submitting to MNEE...');
    const rawTx = tx.toHex();
    const submitResult = await mneeClient.submitRawTx(rawTx, { broadcast: true });
    if (!submitResult.ticketId) return { error: 'No ticket ID returned from MNEE' };

    // Poll for confirmation
    const ticketId = submitResult.ticketId;
    onProgress?.('Waiting for confirmation...');
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const status = await mneeClient.getTxStatus(ticketId);
        if (status.status === 'FAILED') {
          return { ticketId, error: status.errors ?? 'Transaction failed' };
        }
        if (status.status === 'SUCCESS' || status.status === 'MINED') {
          return {
            txid: status.tx_id,
            ticketId,
            amount: MneeClientStatic.fromAtomicAmount(sweepAmount),
          };
        }
      } catch {
        // Transient poll error — keep trying
      }
    }

    return { ticketId, error: 'Timed out waiting for confirmation' };
  } catch (err) {
    console.error('[sweepLegacyMnee]', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

const MneeClientStatic = {
  fromAtomicAmount(atomicAmount: number): number {
    return atomicAmount / 100_000;
  },
};
