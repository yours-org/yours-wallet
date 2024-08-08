import { GetSignatures, SignatureResponse } from 'yours-wallet-provider';
import { DEFAULT_SIGHASH_TYPE } from '../utils/constants';
import { KeysService } from './Keys.service';
import { fromUtxo, Hash, P2PKH, PrivateKey, Script, Transaction, TransactionSignature, Utils } from '@bsv/sdk';
import { Txo } from './txo-store/models/txo';
import LockTemplate from './txo-store/template/lock';
import { TxoStore } from './txo-store';

export class ContractService {
  constructor(
    private readonly keysService: KeysService,
    private readonly txoStore: TxoStore,
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

      const tx = Transaction.fromHex(request.rawtx);
      const sigResponses: SignatureResponse[] = request.sigRequests.flatMap((sigReq) => {
        const privkeys = getPrivKeys(sigReq.address) as PrivateKey[];
        if (!privkeys.length) throw new Error('no-private-key', { cause: sigReq.address });
        return privkeys.map((privKey: PrivateKey) => {
          // const script = sigReq.script ?
          //   Script.fromHex(sigReq.script) :
          //   new P2PKH().lock(privKey.toPublicKey().toAddress());
          // const txIn =
          //   tx.get_input(sigReq.inputIndex) ||
          //   new TxIn(Buffer.from(sigReq.prevTxid, 'hex'), sigReq.outputIndex, script);
          // txIn.set_prev_tx_id(Buffer.from(sigReq.prevTxid, 'hex'));
          // txIn.set_vout(sigReq.outputIndex);
          // txIn.set_satoshis(BigInt(sigReq.satoshis));
          // txIn.set_locking_script(script);
          // script.remove_codeseparators();
          // const subScript = script;
          // const sig = tx
          //   .sign(
          //     privKey,
          //     sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
          //     sigReq.inputIndex,
          //     subScript,
          //     BigInt(sigReq.satoshis),
          //   )
          //   .to_hex();

          // TODO: support multiple OP_CODESEPARATORs and get subScript according to `csIdx`.
          const preimage = TransactionSignature.format({
            sourceTXID: sigReq.prevTxid,
            sourceOutputIndex: sigReq.outputIndex,
            sourceSatoshis: sigReq.satoshis,
            transactionVersion: tx.version,
            otherInputs: tx.inputs.filter((_, index) => index !== sigReq.inputIndex),
            inputIndex: sigReq.inputIndex,
            outputs: tx.outputs,
            inputSequence: tx.inputs[sigReq.inputIndex].sequence,
            subscript: sigReq.script
              ? Script.fromHex(sigReq.script!)
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
      const keys = await this.keysService.retrieveKeys(undefined, true); // using below limit to bypass password
      if (!keys.identityWif || !keys.walletAddress) {
        throw Error('No keys');
      }
      const lockPk = PrivateKey.fromWif(keys.identityWif);
      const tx = new Transaction();
      tx.lockTime = currentBlockHeight;
      for (const lock of locks) {
        const input = fromUtxo(
          {
            txid: lock.txid,
            vout: lock.vout,
            satoshis: Number(lock.satoshis),
            script: Utils.toHex([...lock.script]),
          },
          new LockTemplate().unlock(lockPk, 'all', false, Number(lock.satoshis), Script.fromBinary([...lock.script])),
        );
        input.sequence = 0;
        tx.addInput(input);
      }

      const response = await this.txoStore.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error) {
      console.error('transferOrdinal failed:', error);
      return { error: JSON.stringify(error) };
    }
  };
}
