import {
  BSM,
  P2PKHAddress,
  PrivateKey,
  PublicKey,
  Script,
  SigHash,
  Signature,
  Transaction,
  TxIn,
  TxOut,
} from 'bsv-wasm-web';
import { buildInscription } from 'js-1sat-ord-web';
import { SendBsv, SignedMessage, SignMessage } from 'yours-wallet-provider';
import {
  BSV_DECIMAL_CONVERSION,
  FEE_PER_BYTE,
  MAX_BYTES_PER_TX,
  MAX_FEE_PER_TX,
  P2PKH_INPUT_SIZE,
  P2PKH_OUTPUT_SIZE,
} from '../utils/constants';
import { removeBase64Prefix } from '../utils/format';
import { getPrivateKeyFromTag, Keys } from '../utils/keys';
import { ChromeStorageService } from './ChromeStorage.service';
import { ContractService } from './Contract.service';
import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';
import { getChainParams } from './serviceHelpers';
import { FundRawTxResponse, LockData, SendBsvResponse, UTXO } from './types/bsv.types';
import { ChromeStorageObject } from './types/chromeStorage.types';
import { OrdinalTxo } from './types/ordinal.types';
import { WhatsOnChainService } from './WhatsOnChain.service';

export class BsvService {
  bsvBalance: number;
  exchangeRate: number;
  lockData: LockData;
  constructor(
    private readonly keysService: KeysService,
    private readonly gorillaPoolService: GorillaPoolService,
    private readonly wocService: WhatsOnChainService,
    private readonly contractService: ContractService,
    private readonly chromeStorageService: ChromeStorageService,
  ) {
    this.bsvBalance = 0;
    this.exchangeRate = 0;
    this.lockData = { totalLocked: 0, unlockable: 0, nextUnlock: 0 };
  }

  unlockLockedCoins = async (balanceOnly = false) => {
    if (!this.keysService.identityAddress) return;
    const chainInfo = await this.wocService.getChainInfo();
    let lockedTxos = await this.gorillaPoolService.getLockedBsvUtxos(this.keysService.identityAddress);
    const blockHeight = Number(chainInfo?.blocks);
    const outpoints = lockedTxos.map((txo) => txo.outpoint.toString());
    const spentTxids = await this.gorillaPoolService.getSpentTxids(outpoints);
    lockedTxos = lockedTxos.filter((txo) => !spentTxids.get(txo.outpoint.toString()));
    if (lockedTxos.length > 0) {
      const lockTotal = lockedTxos.reduce((a: number, utxo: OrdinalTxo) => a + utxo.satoshis, 0);
      let unlockableTotal = 0;
      const theBlocksCoinsUnlock: number[] = [];
      lockedTxos.forEach((txo) => {
        const theBlockCoinsUnlock = Number(txo?.data?.lock?.until);
        theBlocksCoinsUnlock.push(theBlockCoinsUnlock);
        if (theBlockCoinsUnlock <= blockHeight) {
          unlockableTotal += txo.satoshis;
        }
      });
      this.lockData = {
        totalLocked: lockTotal,
        unlockable: unlockableTotal,
        nextUnlock: theBlocksCoinsUnlock.sort((a, b) => a - b)[0],
      };
      if (balanceOnly) return;
      const txos = lockedTxos.filter((i) => Number(i.data?.lock?.until) <= blockHeight);
      if (txos.length > 0) {
        return await this.contractService.unlock(txos, blockHeight);
      }
    }
  };

  sendBsv = async (request: SendBsv[], password: string, noApprovalLimit?: number): Promise<SendBsvResponse> => {
    try {
      const requestSats = request.reduce((a: number, item: { satoshis: number }) => a + item.satoshis, 0);
      const bsvSendAmount = requestSats / BSV_DECIMAL_CONVERSION;

      if (bsvSendAmount > Number(noApprovalLimit)) {
        const isAuthenticated = await this.keysService.verifyPassword(password);
        if (!isAuthenticated) {
          return { error: 'invalid-password' };
        }
      }

      let feeSats = 20;
      const isBelowNoApprovalLimit = Number(bsvSendAmount) <= Number(noApprovalLimit);
      const keys = await this.keysService.retrieveKeys(password, isBelowNoApprovalLimit);
      if (!keys?.walletWif || !keys.walletPubKey) throw Error('Undefined key');
      const paymentPk = PrivateKey.from_wif(keys.walletWif);
      const pubKey = paymentPk.to_public_key();
      const network = this.chromeStorageService.getNetwork();
      const fromAddress = pubKey.to_address().set_chain_params(getChainParams(network)).to_string();
      const amount = request.reduce((a, r) => a + r.satoshis, 0);

      // Format in and outs
      const fundingUtxos = await this.wocService.getUtxos(fromAddress);

      if (!fundingUtxos) throw Error('No Utxos!');
      const totalSats = fundingUtxos.reduce((a: number, item: UTXO) => a + item.satoshis, 0);

      if (totalSats < amount) {
        return { error: 'insufficient-funds' };
      }

      const sendAll = totalSats === amount;
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = this.wocService.getInputs(fundingUtxos, satsOut, sendAll);

      const totalInputSats = inputs.reduce((a, item) => a + item.satoshis, 0);

      // Build tx
      const tx = new Transaction(1, 0);

      request.forEach((req) => {
        let outScript: Script;
        if (req.address) {
          if (req.inscription) {
            const { base64Data, mimeType, map } = req.inscription;
            const formattedBase64 = removeBase64Prefix(base64Data);
            outScript = buildInscription(P2PKHAddress.from_string(req.address), formattedBase64, mimeType, map);
            feeSats += Math.ceil(outScript.to_bytes().byteLength * FEE_PER_BYTE);
          } else {
            outScript = P2PKHAddress.from_string(req.address).get_locking_script();
          }
        } else if (req.script) {
          outScript = Script.from_hex(req.script);
          feeSats += Math.ceil(outScript.to_bytes().byteLength * FEE_PER_BYTE);
        } else if ((req.data || []).length > 0) {
          const asm = `OP_0 OP_RETURN ${req.data?.join(' ')}`;
          try {
            outScript = Script.from_asm_string(asm);
          } catch (e) {
            throw Error('Invalid data');
          }
        } else {
          throw Error('Invalid request');
        }
        // TODO: In event where provider method calls this and happens to have multiple outputs that equal all sats available in users wallet, this tx will likely fail due to no fee to miner. Considering an edge case for now.
        const outSats = sendAll && request.length === 1 ? satsOut : req.satoshis;
        tx.add_output(new TxOut(BigInt(outSats), outScript));
      });

      let change = 0;
      if (!sendAll) {
        change = totalInputSats - satsOut - feeSats;
        tx.add_output(new TxOut(BigInt(change), P2PKHAddress.from_string(fromAddress).get_locking_script()));
      }

      // build txins from our inputs
      let idx = 0;
      for (const u of inputs || []) {
        const inTx = new TxIn(Buffer.from(u.txid, 'hex'), u.vout, Script.from_hex(''));

        inTx.set_satoshis(BigInt(u.satoshis));
        tx.add_input(inTx);

        const sig = tx.sign(paymentPk, SigHash.InputOutputs, idx, Script.from_hex(u.script), BigInt(u.satoshis));

        inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
        tx.set_input(idx, inTx);
        idx++;
      }

      // Fee checker
      const finalSatsIn = tx.satoshis_in() ?? 0n;
      const finalSatsOut = tx.satoshis_out() ?? 0n;
      if (finalSatsIn - finalSatsOut > MAX_FEE_PER_TX) return { error: 'fee-too-high' };

      // Size checker
      const bytes = tx.to_bytes().byteLength;
      if (bytes > MAX_BYTES_PER_TX) return { error: 'tx-size-too-large' };

      const rawtx = tx.to_hex();
      const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(rawtx);
      if (txid) {
        if (isBelowNoApprovalLimit) {
          const { account } = this.chromeStorageService.getCurrentAccountObject();
          if (!account) throw Error('No account found!');
          const { noApprovalLimit } = account.settings;
          const key: keyof ChromeStorageObject = 'accounts';
          const update: Partial<ChromeStorageObject['accounts']> = {
            [this.keysService.identityAddress]: {
              ...account,
              settings: {
                ...account.settings,
                noApprovalLimit: noApprovalLimit
                  ? Number((noApprovalLimit - amount / BSV_DECIMAL_CONVERSION).toFixed(8))
                  : 0,
              },
            },
          };
          await this.chromeStorageService.updateNested(key, update);
        }
      }
      return { txid, rawtx };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log(error);
      return { error: error.message ?? 'unknown' };
    }
  };

  signMessage = async (
    messageToSign: SignMessage,
    password: string,
  ): Promise<SignedMessage | { error: string } | undefined> => {
    const { message, encoding } = messageToSign;
    const isAuthenticated = await this.keysService.verifyPassword(password);
    if (!isAuthenticated) {
      return { error: 'invalid-password' };
    }
    try {
      const keys = (await this.keysService.retrieveKeys(password)) as Keys;
      const derivationTag = messageToSign.tag ?? { label: 'panda', id: 'identity', domain: '', meta: {} };
      const privateKey = getPrivateKeyFromTag(derivationTag, keys);

      if (!privateKey.to_wif()) {
        return { error: 'key-type' };
      }

      const network = this.chromeStorageService.getNetwork();
      const publicKey = privateKey.to_public_key();
      const address = publicKey.to_address().set_chain_params(getChainParams(network)).to_string();

      const msgBuf = Buffer.from(message, encoding);
      const signature = BSM.sign_message(privateKey, msgBuf);
      return {
        address,
        pubKey: publicKey.to_hex(),
        message: message,
        sig: Buffer.from(signature.to_compact_hex(), 'hex').toString('base64'),
        derivationTag,
      };
    } catch (error) {
      console.log(error);
    }
  };

  verifyMessage = async (
    message: string,
    signatureHex: string,
    publicKeyHex: string,
    encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  ) => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const msgBuf = Buffer.from(message, encoding);
      const publicKey = PublicKey.from_hex(publicKeyHex);
      const signature = Signature.from_compact_bytes(Buffer.from(signatureHex, 'hex'));
      const address = publicKey.to_address().set_chain_params(getChainParams(network));

      return address.verify_bitcoin_message(msgBuf, signature);
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  updateBsvBalance = async (pullFresh?: boolean) => {
    const total = await this.wocService.getBsvBalance(this.keysService.bsvAddress, pullFresh);
    this.bsvBalance = total ?? 0;
  };

  rate = async () => {
    const r = await this.wocService.getExchangeRate();
    this.exchangeRate = r ?? 0;
  };

  fundRawTx = async (rawtx: string, password: string): Promise<FundRawTxResponse> => {
    const isAuthenticated = await this.keysService.verifyPassword(password);
    if (!isAuthenticated) {
      return { error: 'invalid-password' };
    }

    const keys = await this.keysService.retrieveKeys(password);
    if (!keys.walletWif) throw new Error('Missing keys');
    const paymentPk = PrivateKey.from_wif(keys.walletWif);

    let satsIn = 0;
    let satsOut = 0;
    const tx = Transaction.from_hex(rawtx);
    let inputCount = tx.get_ninputs();
    for (let i = 0; i < inputCount; i++) {
      const txIn = tx.get_input(i);
      if (!txIn) throw Error('Invalid input');
      const txOut = await this.gorillaPoolService.getTxOut(txIn.get_prev_tx_id_hex(), txIn.get_vout());
      if (!txOut) throw Error('Invalid output');
      satsIn += Number(txOut.get_satoshis());
    }
    for (let i = 0; i < tx.get_noutputs(); i++) {
      const output = tx.get_output(i);
      if (!output) throw Error('Invalid output');
      satsOut += Number(output.get_satoshis());
    }
    let size = rawtx.length / 2 + P2PKH_OUTPUT_SIZE;
    let fee = Math.ceil(size * FEE_PER_BYTE);
    const fundingUtxos = await this.wocService.getUtxos(this.keysService.bsvAddress);
    while (satsIn < satsOut + fee) {
      const utxo = fundingUtxos.pop();
      if (!utxo) throw Error('Insufficient funds');
      const txIn = new TxIn(Buffer.from(utxo.txid, 'hex'), utxo.vout, Script.from_hex(''));
      tx.add_input(txIn);
      satsIn += Number(utxo.satoshis);
      size += P2PKH_INPUT_SIZE;
      fee = Math.ceil(size * FEE_PER_BYTE);
      const sig = tx.sign(paymentPk, SigHash.Input, inputCount, Script.from_hex(utxo.script), BigInt(utxo.satoshis));
      txIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
      tx.set_input(inputCount++, txIn);
    }
    tx.add_output(
      new TxOut(
        BigInt(satsIn - satsOut - fee),
        P2PKHAddress.from_string(this.keysService.bsvAddress).get_locking_script(),
      ),
    );
    return { rawtx: tx.to_hex() };
  };
}