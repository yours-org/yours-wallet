import {
  Hash,
  LockingScript,
  OP,
  type PrivateKey,
  type PublicKey,
  type Script,
  type ScriptTemplate,
  type Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
} from '@bsv/sdk';

/**
 * P2PKH (Pay To Public Key Hash) class implementing ScriptTemplate.
 *
 * This class provides methods to create Pay To Public Key Hash locking and unlocking scripts, including the unlocking of P2PKH UTXOs with the private key.
 */
export default class CosignTemplate implements ScriptTemplate {
  /**
   * Creates a P2PKH locking script for a given public key hash or address string
   *
   * @param {number[] | string} userPKHash or address - An array or address representing the public key hash of the owning user.
   * @param {PublicKey} approverPubKey - Public key of the approver.
   * @returns {LockingScript} - A P2PKH locking script.
   */
  lock(userPKHash: string | number[], approverPubKey: PublicKey): LockingScript {
    let pkhash: number[] = [];
    if (typeof userPKHash === 'string') {
      const hash = Utils.fromBase58Check(userPKHash);
      if (hash.prefix[0] !== 0x00 && hash.prefix[0] !== 0x6f) throw new Error('only P2PKH is supported');
      pkhash = hash.data as number[];
    } else {
      pkhash = userPKHash;
    }
    const lockingScript = new LockingScript();
    lockingScript
      .writeOpCode(OP.OP_DUP)
      .writeOpCode(OP.OP_HASH160)
      .writeBin(pkhash)
      .writeOpCode(OP.OP_EQUALVERIFY)
      .writeOpCode(OP.OP_CHECKSIGVERIFY)
      .writeBin(approverPubKey.encode(true) as number[])
      .writeOpCode(OP.OP_CHECKSIG);

    return lockingScript;
  }

  /**
   * Creates a function that generates a P2PKH unlocking script along with its signature and length estimation.
   *
   * The returned object contains:
   * 1. `sign` - A function that, when invoked with a transaction and an input index,
   *    produces an unlocking script suitable for a P2PKH locked output.
   * 2. `estimateLength` - A function that returns the estimated length of the unlocking script in bytes.
   *
   * @param {PrivateKey} userPrivateKey - The private key used for signing the transaction.
   * @param {'all'|'none'|'single'} signOutputs - The signature scope for outputs.
   * @param {boolean} anyoneCanPay - Flag indicating if the signature allows for other inputs to be added later.
   * @param {number} sourceSatoshis - Optional. The amount being unlocked. Otherwise the input.sourceTransaction is required.
   * @param {Script} lockingScript - Optional. The lockinScript. Otherwise the input.sourceTransaction is required.
   * @returns {Object} - An object containing the `sign` and `estimateLength` functions.
   */
  userUnlock(
    userPrivateKey: PrivateKey,
    signOutputs: 'all' | 'none' | 'single' = 'all',
    anyoneCanPay = false,
    sourceSatoshis?: number,
    lockingScript?: Script,
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>;
    estimateLength: () => Promise<182>;
  } {
    return {
      sign: async (tx: Transaction, inputIndex: number) => {
        let signatureScope = TransactionSignature.SIGHASH_FORKID;
        if (signOutputs === 'all') {
          signatureScope |= TransactionSignature.SIGHASH_ALL;
        }
        if (signOutputs === 'none') {
          signatureScope |= TransactionSignature.SIGHASH_NONE;
        }
        if (signOutputs === 'single') {
          signatureScope |= TransactionSignature.SIGHASH_SINGLE;
        }
        if (anyoneCanPay) {
          signatureScope |= TransactionSignature.SIGHASH_ANYONECANPAY;
        }

        const input = tx.inputs[inputIndex];

        const otherInputs = tx.inputs.filter((_, index) => index !== inputIndex);

        const sourceTXID = input.sourceTXID ? input.sourceTXID : input.sourceTransaction?.id('hex');
        if (!sourceTXID) {
          throw new Error('The input sourceTXID or sourceTransaction is required for transaction signing.');
        }
        sourceSatoshis ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis;
        if (!sourceSatoshis) {
          throw new Error('The sourceSatoshis or input sourceTransaction is required for transaction signing.');
        }
        lockingScript ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript;
        if (!lockingScript) {
          throw new Error('The lockingScript or input sourceTransaction is required for transaction signing.');
        }

        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: input.sourceOutputIndex,
          sourceSatoshis,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: input.sequence || 0xffffffff,
          subscript: lockingScript,
          lockTime: tx.lockTime,
          scope: signatureScope,
        });
        const rawSignature = userPrivateKey.sign(Hash.sha256(preimage));
        const sig = new TransactionSignature(rawSignature.r, rawSignature.s, signatureScope);
        const unlockScript = new UnlockingScript();
        unlockScript.writeBin(sig.toChecksigFormat());
        unlockScript.writeBin(userPrivateKey.toPublicKey().encode(true) as number[]);
        return unlockScript;
      },
      estimateLength: async () => {
        // public key (1+33) + signature (1+73) + approver signature (1+73)
        // Note: We add 1 to each element's length because of the associated OP_PUSH
        return 182;
      },
    };
  }

  /**
   * Creates a function that generates a P2PKH unlocking script along with its signature and length estimation.
   *
   * The returned object contains:
   * 1. `sign` - A function that, when invoked with a transaction and an input index,
   *    produces an unlocking script suitable for a P2PKH locked output.
   * 2. `estimateLength` - A function that returns the estimated length of the unlocking script in bytes.
   *
   * @param {PrivateKey} approverPrivateKey - The private key used for signing the transaction.
   * @param {'all'|'none'|'single'} signOutputs - The signature scope for outputs.
   * @param {boolean} anyoneCanPay - Flag indicating if the signature allows for other inputs to be added later.
   * @param {number} sourceSatoshis - Optional. The amount being unlocked. Otherwise the input.sourceTransaction is required.
   * @param {Script} lockingScript - Optional. The lockinScript. Otherwise the input.sourceTransaction is required.
   * @returns {Object} - An object containing the `sign` and `estimateLength` functions.
   */
  unlock(
    approverPrivateKey: PrivateKey,
    userSigScript: Script,
    signOutputs: 'all' | 'none' | 'single' = 'all',
    anyoneCanPay = false,
    sourceSatoshis?: number,
    lockingScript?: Script,
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>;
    estimateLength: () => Promise<182>;
  } {
    return {
      sign: async (tx: Transaction, inputIndex: number) => {
        let signatureScope = TransactionSignature.SIGHASH_FORKID;
        if (signOutputs === 'all') {
          signatureScope |= TransactionSignature.SIGHASH_ALL;
        }
        if (signOutputs === 'none') {
          signatureScope |= TransactionSignature.SIGHASH_NONE;
        }
        if (signOutputs === 'single') {
          signatureScope |= TransactionSignature.SIGHASH_SINGLE;
        }
        if (anyoneCanPay) {
          signatureScope |= TransactionSignature.SIGHASH_ANYONECANPAY;
        }

        const input = tx.inputs[inputIndex];

        const otherInputs = tx.inputs.filter((_, index) => index !== inputIndex);

        const sourceTXID = input.sourceTXID ? input.sourceTXID : input.sourceTransaction?.id('hex');
        if (!sourceTXID) {
          throw new Error('The input sourceTXID or sourceTransaction is required for transaction signing.');
        }
        sourceSatoshis ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis;
        if (!sourceSatoshis) {
          throw new Error('The sourceSatoshis or input sourceTransaction is required for transaction signing.');
        }
        lockingScript ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript;
        if (!lockingScript) {
          throw new Error('The lockingScript or input sourceTransaction is required for transaction signing.');
        }

        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: input.sourceOutputIndex,
          sourceSatoshis,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: input.sequence || 0xffffffff,
          subscript: lockingScript,
          lockTime: tx.lockTime,
          scope: signatureScope,
        });
        const rawSignature = approverPrivateKey.sign(Hash.sha256(preimage));
        const sig = new TransactionSignature(rawSignature.r, rawSignature.s, signatureScope);
        const unlockScript = new UnlockingScript();
        unlockScript.writeBin(sig.toChecksigFormat());
        unlockScript.writeScript(userSigScript);
        return unlockScript;
      },
      estimateLength: async () => {
        // public key (1+33) + signature (1+73) + approver signature (1+73)
        // Note: We add 1 to each element's length because of the associated OP_PUSH
        return 182;
      },
    };
  }
}
