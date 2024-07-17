import { GetSignatures, Ordinal, SignatureResponse } from 'yours-wallet-provider';
import { DUST, FEE_PER_KB, LOCK_SUFFIX, SCRYPT_PREFIX } from '../utils/constants';
import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';

const DEFAULT_SIGHASH_TYPE = 65; // SIGHASH_ALL | SIGHASH_FORKID

export class ContractService {
  constructor(
    private readonly keysService: KeysService,
    private readonly gorillaPoolService: GorillaPoolService,
  ) {}

  getSignatures = async (
    request: GetSignatures,
    password: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ sigResponses?: SignatureResponse[]; error?: { message: string; cause?: any } }> => {
    // try {
    //   const isAuthenticated = await this.keysService.verifyPassword(password);
    //   if (!isAuthenticated) {
    //     throw new Error('invalid-password');
    //   }

    //   const keys = await this.keysService.retrieveKeys(password);
    //   const getPrivKeys = (address: string | string[]) => {
    //     const addresses = address instanceof Array ? address : [address];
    //     return addresses.map((addr) => {
    //       if (addr === this.keysService.bsvAddress) {
    //         return keys?.walletWif && PrivateKey.from_wif(keys.walletWif);
    //       }
    //       if (addr === this.keysService.ordAddress) {
    //         return keys?.ordWif && PrivateKey.from_wif(keys.ordWif);
    //       }
    //       if (addr === this.keysService.identityAddress) {
    //         return keys?.identityWif && PrivateKey.from_wif(keys.identityWif);
    //       }
    //       throw new Error('unknown-address', { cause: addr });
    //     });
    //   };

    //   const tx = Transaction.from_hex(request.rawtx);
    //   const sigResponses: SignatureResponse[] = request.sigRequests.flatMap((sigReq) => {
    //     const privkeys = getPrivKeys(sigReq.address) as PrivateKey[];
    //     if (!privkeys.length) throw new Error('no-private-key', { cause: sigReq.address });
    //     return privkeys.map((privKey: PrivateKey) => {
    //       const addr = privKey.to_public_key().to_address();
    //       const script = sigReq.script ? Script.from_hex(sigReq.script) : addr.get_locking_script();
    //       const txIn =
    //         tx.get_input(sigReq.inputIndex) ||
    //         new TxIn(Buffer.from(sigReq.prevTxid, 'hex'), sigReq.outputIndex, script);
    //       txIn.set_prev_tx_id(Buffer.from(sigReq.prevTxid, 'hex'));
    //       txIn.set_vout(sigReq.outputIndex);
    //       txIn.set_satoshis(BigInt(sigReq.satoshis));
    //       txIn.set_locking_script(script);

    //       script.remove_codeseparators();
    //       // TODO: support multiple OP_CODESEPARATORs and get subScript according to `csIdx`.
    //       const subScript = script;

    //       const sig = tx
    //         .sign(
    //           privKey,
    //           sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
    //           sigReq.inputIndex,
    //           subScript,
    //           BigInt(sigReq.satoshis),
    //         )
    //         .to_hex();

    //       return {
    //         sig,
    //         pubKey: privKey.to_public_key().to_hex(),
    //         inputIndex: sigReq.inputIndex,
    //         sigHashType: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
    //         csIdx: sigReq.csIdx,
    //       };
    //     });
    //   });
    //   return Promise.resolve({ sigResponses });

    //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // } catch (err: any) {
    //   console.error('getSignatures error', err);
    //   return {
    //     error: {
    //       message: err.message ?? 'unknown',
    //       cause: err.cause,
    //     },
    //   };
    // }
    return { error: { message: 'not-implemented' } };
  };

  unlock = async (locks: Ordinal[], currentBlockHeight: number) => {
    // try {
    //   const keys = await this.keysService.retrieveKeys(undefined, true); // using below limit to bypass password
    //   if (!keys.identityWif || !keys.walletAddress) {
    //     throw Error('No keys');
    //   }
    //   const lockPk = PrivateKey.from_wif(keys.identityWif);
    //   const lockPkh = Hash.hash_160(lockPk.to_public_key().to_bytes()).to_bytes();
    //   const walletAddress = P2PKHAddress.from_string(keys.walletAddress);
    //   const tx = new Transaction(1, 0);
    //   tx.set_nlocktime(currentBlockHeight);
    //   let satsIn = 0;
    //   let size = 0;
    //   for (const lock of locks) {
    //     const txin = new TxIn(Buffer.from(lock.txid, 'hex'), lock.vout, Script.from_hex(''));
    //     txin?.set_sequence(0);
    //     tx.add_input(txin);
    //     satsIn += lock.satoshis;
    //     size += 1500;
    //   }
    //   const fee = Math.ceil(size * FEE_PER_BYTE);
    //   if (fee > satsIn) {
    //     return { error: 'insufficient-funds' };
    //   }
    //   const change = satsIn - fee;
    //   if (change > DUST) {
    //     tx.add_output(new TxOut(BigInt(change), walletAddress.get_locking_script()));
    //   }
    //   for (const [vin, lock] of locks.entries()) {
    //     if (!lock?.data?.lock?.until) continue;
    //     const fragment = Script.from_asm_string(
    //       Buffer.from(lockPkh).toString('hex') +
    //         ' ' +
    //         Buffer.from(lock.data.lock.until.toString(16).padStart(6, '0'), 'hex').reverse().toString('hex'),
    //     );
    //     const script = Script.from_hex(SCRYPT_PREFIX + fragment.to_hex() + LOCK_SUFFIX);
    //     const preimage = tx.sighash_preimage(SigHash.InputsOutputs, vin, script, BigInt(lock.satoshis));
    //     const sig = tx.sign(lockPk, SigHash.InputsOutputs, vin, script, BigInt(lock.satoshis));
    //     const asm = `${sig.to_hex()} ${lockPk.to_public_key().to_hex()} ${Buffer.from(preimage).toString('hex')}`;
    //     const txin = tx.get_input(vin);
    //     if (!txin) throw Error('no-txin');
    //     txin?.set_unlocking_script(Script.from_asm_string(asm));
    //     tx.set_input(vin, txin);
    //   }
    //   const rawTx = tx.to_hex();
    //   const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(rawTx);
    //   if (!txid) return { error: 'broadcast-error' };
    //   return { txid };
    //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // } catch (error: any) {
    //   console.log(error);
    //   return { error: error.message ?? 'unknown' };
    // }
  };
}
