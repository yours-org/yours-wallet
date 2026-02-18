import { GetSignatures, SignatureResponse } from 'yours-wallet-provider';
import { DEFAULT_SIGHASH_TYPE, FEE_PER_KB } from '../utils/constants';
import { KeysService } from './Keys.service';
import { Hash, P2PKH, PrivateKey, SatoshisPerKilobyte, Script, Transaction, TransactionSignature, Utils } from '@bsv/sdk';
import { SPVStore, Txo } from 'spv-store';
import { LockTemplate } from 'spv-store';
export class ContractService {
  constructor(
    private readonly keysService: KeysService,
    private readonly oneSatSPV: SPVStore,
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
      for (const lock of locks) {
        const pk = pkMap.get(lock.owner || '');
        if (!pk) continue;
        // const input = fromUtxo(
        //   {
        //     txid: lock.outpoint.txid,
        //     vout: lock.outpoint.vout,
        //     satoshis: Number(lock.satoshis),
        //     script: Utils.toHex([...lock.script]),
        //   },
        //   new LockTemplate().unlock(pk, 'all', false, Number(lock.satoshis), Script.fromBinary(lock.script)),
        // );
        // input.sequence = 0;
        tx.addInput({
          sourceTransaction: await this.oneSatSPV.getTx(lock.outpoint.txid),
          sourceOutputIndex: lock.outpoint.vout,
          sequence: 0,
          unlockingScriptTemplate: new LockTemplate().unlock(
            pk,
            'all',
            false,
            Number(lock.satoshis),
            Script.fromBinary(lock.script),
          ),
        });
      }

      await tx.fee(new SatoshisPerKilobyte(FEE_PER_KB));
      await tx.sign();
      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error) {
      console.error('unlock failed:', error);
      return { error: JSON.stringify(error) };
    }
  };
}
