import { OrdP2PKH } from 'js-1sat-ord';
import { Ordinal, SendBsv, SignedMessage, SignMessage } from 'yours-wallet-provider';
import { BSV_DECIMAL_CONVERSION, FEE_PER_KB, MAX_BYTES_PER_TX } from '../utils/constants';
import { removeBase64Prefix } from '../utils/format';
import { getPrivateKeyFromTag, Keys } from '../utils/keys';
import { ChromeStorageService } from './ChromeStorage.service';
import { ContractService } from './Contract.service';
import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';
import { LockData, SendBsvResponse } from './types/bsv.types';
import { ChromeStorageObject } from './types/chromeStorage.types';
import { WhatsOnChainService } from './WhatsOnChain.service';
import { TxoStore } from './txo-store';
import { TxoLookup } from './txo-store/models/txo';
import {
  BigNumber,
  BSM,
  ECDSA,
  P2PKH,
  PrivateKey,
  PublicKey,
  SatoshisPerKilobyte,
  Script,
  Signature,
  Transaction,
  Utils,
} from '@bsv/sdk';

export class BsvService {
  private bsvBalance: number;
  private exchangeRate: number;
  private lockData: LockData;
  constructor(
    private readonly keysService: KeysService,
    private readonly gorillaPoolService: GorillaPoolService,
    private readonly wocService: WhatsOnChainService,
    private readonly contractService: ContractService,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly txoStore: TxoStore,
  ) {
    this.bsvBalance = 0;
    this.exchangeRate = 0;
    this.lockData = { totalLocked: 0, unlockable: 0, nextUnlock: 0 };
  }

  getBsvBalance = () => this.bsvBalance;
  getExchangeRate = () => this.exchangeRate;
  getLockData = () => this.lockData;

  rate = async () => {
    const r = await this.wocService.getExchangeRate();
    this.exchangeRate = r ?? 0;
  };

  unlockLockedCoins = async (balanceOnly = false) => {
    if (!this.keysService.identityAddress) return;
    const chainInfo = await this.wocService.getChainInfo();
    let lockedTxos = await this.gorillaPoolService.getLockedBsvUtxos(this.keysService.identityAddress);
    const blockHeight = Number(chainInfo?.blocks);
    const outpoints = lockedTxos.map((txo) => txo.outpoint.toString());
    const spentTxids = await this.gorillaPoolService.getSpentTxids(outpoints);
    lockedTxos = lockedTxos.filter((txo) => !spentTxids.get(txo.outpoint.toString()));
    if (lockedTxos.length > 0) {
      const lockTotal = lockedTxos.reduce((a: number, utxo: Ordinal) => a + utxo.satoshis, 0);
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

  // TODO: Reimplement SendAll
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

      // let feeSats = 20;
      const isBelowNoApprovalLimit = Number(bsvSendAmount) <= Number(noApprovalLimit);
      const keys = await this.keysService.retrieveKeys(password, isBelowNoApprovalLimit);
      if (!keys?.walletWif || !keys.walletPubKey) throw Error('Undefined key');
      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const pubKey = paymentPk.toPublicKey();
      const network = this.chromeStorageService.getNetwork();
      const fromAddress = pubKey.toAddress([network == 'mainnet' ? 0 : 0x6f]);
      const amount = request.reduce((a, r) => a + r.satoshis, 0);

      // Build tx
      const tx = new Transaction();
      let satsOut = 0;
      request.forEach((req) => {
        let outScript: Script;
        if (req.address) {
          if (req.inscription) {
            const { base64Data, mimeType, map } = req.inscription;
            const formattedBase64 = removeBase64Prefix(base64Data);

            outScript = new OrdP2PKH().lock(req.address, formattedBase64, mimeType, map);
          } else {
            outScript = new P2PKH().lock(req.address);
          }
        } else if (req.script) {
          outScript = Script.fromHex(req.script);
        } else if ((req.data || []).length > 0) {
          const asm = `OP_0 OP_RETURN ${req.data?.join(' ')}`;
          try {
            outScript = Script.fromASM(asm);
          } catch (e) {
            throw Error('Invalid data');
          }
        } else {
          throw Error('Invalid request');
        }

        satsOut += req.satoshis;
        tx.addOutput({
          satoshis: req.satoshis,
          lockingScript: outScript,
        });
      });

      tx.addOutput({
        lockingScript: new P2PKH().lock(fromAddress),
        change: true,
      });

      const fundResults = await this.txoStore.searchTxos(
        new TxoLookup('fund', 'address', this.keysService.bsvAddress, false),
        0,
      );

      let satsIn = 0;
      let fee = 0;
      for await (const u of fundResults.txos || []) {
        tx.addInput({
          sourceTransaction: await this.txoStore.getTx(u.txid),
          sourceOutputIndex: u.vout,
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(paymentPk),
        });
        satsIn += Number(u.satoshis);
        fee = await tx.getFee();
        if (satsIn >= satsOut + fee) break;
      }
      if (satsIn < satsOut + fee) return { error: 'insufficient-funds' };
      await tx.fee(new SatoshisPerKilobyte(FEE_PER_KB));
      await tx.sign();

      // Size checker
      const bytes = tx.toBinary().length;
      if (bytes > MAX_BYTES_PER_TX) return { error: 'tx-size-too-large' };

      const response = await this.txoStore.broadcast(tx);
      if (response.status == 'error') return { error: response.description };
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
      return { txid: tx.id('hex'), rawtx: Utils.toHex(tx.toBinary()) };
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

      if (!privateKey.toWif()) {
        return { error: 'key-type' };
      }

      const network = this.chromeStorageService.getNetwork();
      const publicKey = privateKey.toPublicKey();
      const address = publicKey.toAddress([network == 'mainnet' ? 0 : 0x6f]);

      const msgHash = new BigNumber(BSM.magicHash(Utils.toArray(message, encoding)));
      const signature = ECDSA.sign(msgHash, privateKey, true);
      const recovery = signature.CalculateRecoveryFactor(publicKey, msgHash);

      return {
        address,
        pubKey: publicKey.toString(),
        message: message,
        sig: signature.toCompact(recovery, true, 'base64') as string,
        derivationTag,
      };
    } catch (error) {
      console.log(error);
    }
    return { error: 'not-implemented' };
  };

  verifyMessage = async (
    message: string,
    signatureHex: string,
    publicKeyHex: string,
    encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  ) => {
    try {
      const msgBuf = Buffer.from(message, encoding);
      const publicKey = PublicKey.fromString(publicKeyHex);
      const signature = Signature.fromCompact(Utils.toArray(signatureHex, 'hex'));
      return BSM.verify(Array.from(msgBuf), signature, publicKey);
    } catch (error) {
      console.error(error);
      return false;
    }
    return false;
  };

  // TODO: Either implement pullFresh or remove it
  updateBsvBalance = async (pullFresh?: boolean) => {
    const utxos = await this.fundingTxos();
    const total = utxos.reduce((a, item) => a + Number(item.satoshis), 0);
    this.bsvBalance = (total ?? 0) / BSV_DECIMAL_CONVERSION;
    const balance = {
      bsv: this.bsvBalance,
      satoshis: total,
      usdInCents: Math.round(this.bsvBalance * this.exchangeRate * 100),
    };
    const { account } = this.chromeStorageService.getCurrentAccountObject();
    if (!account) throw Error('No account found!');
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [this.keysService.identityAddress]: {
        ...account,
        balance,
      },
    };
    await this.chromeStorageService.updateNested(key, update);
  };

  fundingTxos = async () => {
    const results = await this.txoStore.searchTxos(
      new TxoLookup('fund', 'address', this.keysService.bsvAddress, false),
      0,
    );
    return results.txos;
  };

  // fundRawTx = async (rawtx: string, password: string): Promise<FundRawTxResponse> => {
  //   const isAuthenticated = await this.keysService.verifyPassword(password);
  //   if (!isAuthenticated) {
  //     return { error: 'invalid-password' };
  //   }

  //   const keys = await this.keysService.retrieveKeys(password);
  //   if (!keys.walletWif) throw new Error('Missing keys');
  //   const paymentPk = PrivateKey.fromWif(keys.walletWif);

  //   let satsIn = 0;
  //   let satsOut = 0;
  //   const tx = Transaction.fromHex(rawtx);
  //   let inputCount = tx.get_ninputs();
  //   for (let i = 0; i < inputCount; i++) {
  //     const txIn = tx.get_input(i);
  //     if (!txIn) throw Error('Invalid input');
  //     const txOut = await this.gorillaPoolService.getTxOut(txIn.get_prev_tx_id_hex(), txIn.get_vout());
  //     if (!txOut) throw Error('Invalid output');
  //     satsIn += Number(txOut.get_satoshis());
  //   }
  //   for (let i = 0; i < tx.get_noutputs(); i++) {
  //     const output = tx.get_output(i);
  //     if (!output) throw Error('Invalid output');
  //     satsOut += Number(output.get_satoshis());
  //   }
  //   let size = rawtx.length / 2 + P2PKH_OUTPUT_SIZE;
  //   let fee = Math.ceil(size * FEE_PER_BYTE);
  //   const fundingUtxos = await this.wocService.getAndUpdateUtxoStorage(this.keysService.bsvAddress);
  //   while (satsIn < satsOut + fee) {
  //     const utxo = fundingUtxos.pop();
  //     if (!utxo) throw Error('Insufficient funds');
  //     const txIn = new TxIn(Buffer.from(utxo.txid, 'hex'), utxo.vout, Script.from_hex(''));
  //     tx.add_input(txIn);
  //     satsIn += Number(utxo.satoshis);
  //     size += P2PKH_INPUT_SIZE;
  //     fee = Math.ceil(size * FEE_PER_BYTE);
  //     const sig = tx.sign(paymentPk, SigHash.Input, inputCount, Script.from_hex(utxo.script), BigInt(utxo.satoshis));
  //     txIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
  //     tx.set_input(inputCount++, txIn);
  //   }
  //   tx.add_output(
  //     new TxOut(
  //       BigInt(satsIn - satsOut - fee),
  //       P2PKHAddress.from_string(this.keysService.bsvAddress).get_locking_script(),
  //     ),
  //   );
  //   return { rawtx: tx.to_hex() };
  // };
}
