import {
  BigNumber,
  type LockingScript,
  OP,
  P2PKH,
  type PrivateKey,
  Script,
  type Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
} from '@bsv/sdk';

export const lockPrefix =
  '2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000';

export const lockSuffix =
  '610079040065cd1d9f690079547a75537a537a537a5179537a75527a527a7575615579014161517957795779210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce081059795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a756169557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a7561040065cd1d9f6955796100796100798277517951790128947f755179012c947f77517a75517a756161007901007e81517a7561517a756105ffffffff009f69557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a75615279a2695679a95179876957795779ac7777777777777777';

/**
 * OrdLock class implementing ScriptTemplate.
 *
 * This class provides methods for interacting with OrdinalLock contract
 */
export default class LockTemplate {
  /**
   * Creates a Lock script
   *
   * @param {string} address
   * @param {number} until - Block height when unlockable
   * @returns {LockingScript} - A P2PKH locking script.
   */
  lock(address: string, until: number): Script {
    const pkh = Utils.fromBase58Check(address).data as number[];

    return new Script()
      .writeScript(Script.fromHex(lockPrefix))
      .writeBin(pkh)
      .writeNumber(until)
      .writeScript(Script.fromHex(lockSuffix));
  }

  unlock(
    privateKey: PrivateKey,
    signOutputs: 'all' | 'none' | 'single' = 'all',
    anyoneCanPay = false,
    sourceSatoshis?: number,
    lockingScript?: Script,
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>;
    estimateLength: (tx: Transaction, inputIndex: number) => Promise<number>;
  } {
    const unlock = {
      sign: async (tx: Transaction, inputIndex: number) => {
        const input = tx.inputs[inputIndex];
        let sourceSats = sourceSatoshis as number;
        if (!sourceSats && input.sourceTransaction) {
          sourceSats = input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis as number;
        } else if (!sourceSatoshis) {
          throw new Error('sourceTransaction or sourceSatoshis is required');
        }

        const sourceTXID = (input.sourceTXID || input.sourceTransaction?.id('hex')) as string;
        let subscript = lockingScript as LockingScript;
        if (!subscript) {
          subscript = input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript as LockingScript;
        }
        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: input.sourceOutputIndex,
          sourceSatoshis: sourceSats,
          transactionVersion: tx.version,
          otherInputs: [],
          inputIndex,
          outputs: tx.outputs,
          inputSequence: input.sequence,
          subscript,
          lockTime: tx.lockTime,
          scope:
            TransactionSignature.SIGHASH_ALL |
            TransactionSignature.SIGHASH_ANYONECANPAY |
            TransactionSignature.SIGHASH_FORKID,
        });

        const p2pkh = new P2PKH().unlock(privateKey, signOutputs, anyoneCanPay, sourceSatoshis, lockingScript);
        return (await p2pkh.sign(tx, inputIndex)).writeBin(preimage);
      },
      estimateLength: async (tx: Transaction, inputIndex: number) => {
        return (await unlock.sign(tx, inputIndex)).toBinary().length;
      },
    };
    return unlock;
  }
}
