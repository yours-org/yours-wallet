import { GetSignatures, SignatureResponse } from 'yours-wallet-provider';
import { DEFAULT_SIGHASH_TYPE } from '../utils/constants';
import { KeysService } from './Keys.service';
import { Hash, P2PKH, PrivateKey, Script, Transaction, TransactionSignature, Utils } from '@bsv/sdk';
import type { OneSatWallet, Txo } from '@1sat/wallet-toolbox';

// LockTemplate for time-locked coins - simplified version
// TODO: Move to a shared templates module
class LockTemplate {
  private lockPrefix = '20d37f4de0d1c735b4d51a5572df0f3d9104d1d9e99db8694fdd1b1a92e1f0dce1757601687f76a9';
  private lockSuffix = '88ac7e7601207f75a9011488';

  lock(address: string, until: number): Script {
    const pkh = Utils.fromBase58Check(address).data as number[];
    return new Script()
      .writeScript(Script.fromHex(this.lockPrefix))
      .writeBin(pkh)
      .writeNumber(until)
      .writeScript(Script.fromHex(this.lockSuffix));
  }

  unlock(
    privateKey: PrivateKey,
    signOutputs: 'all' | 'none' | 'single' = 'all',
    anyoneCanPay = false,
    sourceSatoshis?: number,
    lockingScript?: Script,
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<Script>;
    estimateLength: (tx: Transaction, inputIndex: number) => Promise<number>;
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
        const sats = sourceSatoshis ?? input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis ?? 0;
        const subscript =
          lockingScript ?? input.sourceTransaction?.outputs[input.sourceOutputIndex]?.lockingScript ?? new Script();
        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: input.sourceOutputIndex,
          sourceSatoshis: sats,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: input.sequence ?? 0xffffffff,
          subscript,
          lockTime: tx.lockTime,
          scope: signatureScope,
        });
        const rawSignature = privateKey.sign(Hash.sha256(preimage));
        const sig = new TransactionSignature(rawSignature.r, rawSignature.s, signatureScope);
        const pubKey = privateKey.toPublicKey();
        return new Script().writeBin(sig.toChecksigFormat()).writeBin(pubKey.encode(true) as number[]);
      },
      estimateLength: async () => {
        return 108; // Approximate signature + pubkey length
      },
    };
  }
}

// LockTxo interface removed - now using Txo from @1sat/wallet-toolbox

export class ContractService {
  constructor(
    private readonly keysService: KeysService,
    private readonly wallet: OneSatWallet,
  ) {}

  getSignatures = async (
    request: GetSignatures,
    password: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ sigResponses?: SignatureResponse[]; error?: { message: string; cause?: any } }> => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        throw new Error('invalid-password');
      }

      const keys = await this.keysService.retrieveKeys(password);
      const getPrivKeys = (address: string | string[]) => {
        const addresses = address instanceof Array ? address : [address];
        return addresses.map((addr) => {
          if (addr === this.keysService.bsvAddress) {
            return keys?.walletWif && PrivateKey.fromWif(keys.walletWif);
          }
          if (addr === this.keysService.ordAddress) {
            return keys?.ordWif && PrivateKey.fromWif(keys.ordWif);
          }
          if (addr === this.keysService.identityAddress) {
            return keys?.identityWif && PrivateKey.fromWif(keys.identityWif);
          }
          throw new Error('unknown-address', { cause: addr });
        });
      };

      let tx: Transaction;
      switch (request.format) {
        case 'beef':
          tx = Transaction.fromHexBEEF(request.rawtx);
          break;
        case 'ef':
          tx = Transaction.fromHexEF(request.rawtx);
          break;
        default:
          tx = Transaction.fromHex(request.rawtx);
          break;
      }
      const sigResponses: SignatureResponse[] = request.sigRequests.flatMap((sigReq) => {
        const privkeys = getPrivKeys(sigReq.address) as PrivateKey[];
        if (!privkeys.length) throw new Error('no-private-key', { cause: sigReq.address });
        return privkeys.map((privKey: PrivateKey) => {
          // TODO: support multiple OP_CODESEPARATORs and get subScript according to `csIdx`. See SignatureRequest.csIdx in the GetSignatures type.
          const preimage = TransactionSignature.format({
            sourceTXID: sigReq.prevTxid,
            sourceOutputIndex: sigReq.outputIndex,
            sourceSatoshis: sigReq.satoshis,
            transactionVersion: tx.version,
            otherInputs: tx.inputs.filter((_, index) => index !== sigReq.inputIndex),
            inputIndex: sigReq.inputIndex,
            outputs: tx.outputs,
            inputSequence: tx.inputs[sigReq.inputIndex].sequence || 0,
            subscript: sigReq.script
              ? Script.fromHex(sigReq.script)
              : new P2PKH().lock(privKey.toPublicKey().toAddress()),
            lockTime: tx.lockTime,
            scope: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
          });
          const rawSignature = privKey.sign(Hash.sha256(preimage));
          const sig = new TransactionSignature(
            rawSignature.r,
            rawSignature.s,
            sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
          );
          return {
            sig: Utils.toHex(sig.toChecksigFormat()),
            pubKey: privKey.toPublicKey().toString(),
            inputIndex: sigReq.inputIndex,
            sigHashType: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
            csIdx: sigReq.csIdx,
          };
        });
      });
      return Promise.resolve({ sigResponses });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('getSignatures error', err);
      return {
        error: {
          message: err.message ?? 'unknown',
          cause: err.cause,
        },
      };
    }
  };

  unlock = async (locks: Txo[], currentBlockHeight: number) => {
    try {
      const pkMap = await this.keysService.retrievePrivateKeyMap(undefined, true);
      const bsvAddress = this.keysService.bsvAddress;
      const tx = new Transaction();
      tx.lockTime = currentBlockHeight;
      tx.addOutput({
        lockingScript: new P2PKH().lock(bsvAddress),
        change: true,
      });
      for (const txo of locks) {
        const pk = pkMap.get(txo.owner || '');
        if (!pk) continue;
        const sourceTransaction = await this.wallet.loadTransaction(txo.outpoint.txid);
        if (!sourceTransaction) {
          console.log(`Could not find source transaction ${txo.outpoint.txid}`);
          continue;
        }
        const satoshis = txo.output.satoshis || 0;
        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: txo.outpoint.vout,
          sequence: 0,
          unlockingScriptTemplate: new LockTemplate().unlock(pk, 'all', false, satoshis, txo.output.lockingScript),
        });
      }

      await tx.fee();
      await tx.sign();
      const txid = tx.id('hex');
      await this.wallet.broadcast(tx, 'Unlock Locked Coins');
      return { txid };
    } catch (error) {
      console.error('unlock failed:', error);
      return { error: JSON.stringify(error) };
    }
  };
}
