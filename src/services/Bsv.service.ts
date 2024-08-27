import { OrdP2PKH } from 'js-1sat-ord';
import { NetWork, SendBsv, SignedMessage, SignMessage } from 'yours-wallet-provider';
import {
  BSV_DECIMAL_CONVERSION,
  FEE_PER_KB,
  MAINNET_ADDRESS_PREFIX,
  MAX_BYTES_PER_TX,
  TESTNET_ADDRESS_PREFIX,
} from '../utils/constants';
import { removeBase64Prefix } from '../utils/format';
import { getPrivateKeyFromTag, Keys } from '../utils/keys';
import { ChromeStorageService } from './ChromeStorage.service';
import { ContractService } from './Contract.service';
import { KeysService } from './Keys.service';
import { FundRawTxResponse, LockData, InWalletBsvResponse } from './types/bsv.types';
import { ChromeStorageObject } from './types/chromeStorage.types';
import { WhatsOnChainService } from './WhatsOnChain.service';
import {
  BigNumber,
  BSM,
  ECDSA,
  P2PKH,
  PublicKey,
  SatoshisPerKilobyte,
  Script,
  Signature,
  Transaction,
  Utils,
} from '@bsv/sdk';
import { CaseModSPV, Lock, TxoLookup } from 'ts-casemod-spv';
// import { PaymailClient } from '@bsv/paymail/dist/esm/src/paymailClient';

// const client = new PaymailClient();

export class BsvService {
  private bsvBalance: number;
  private exchangeRate: number;
  constructor(
    private readonly keysService: KeysService,
    private readonly wocService: WhatsOnChainService,
    private readonly contractService: ContractService,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly oneSatSPV: CaseModSPV,
  ) {
    this.bsvBalance = 0;
    this.exchangeRate = 0;
  }

  getBsvBalance = () => this.bsvBalance;
  getExchangeRate = () => this.exchangeRate;
  getLockData = async (): Promise<LockData> => {
    const lockData = {
      totalLocked: 0,
      unlockable: 0,
      nextUnlock: 0,
    };

    const lockTxos = await this.getLockedTxos();
    for (const txo of lockTxos) {
      const height = await this.getCurrentHeight();
      const lock = txo.data.lock?.data as Lock;
      if (!lock) continue;
      lockData.totalLocked += Number(txo.satoshis);
      if (lock.until <= height) {
        lockData.unlockable += Number(txo.satoshis);
      } else if (!lockData.nextUnlock || lock.until < lockData.nextUnlock) {
        lockData.nextUnlock = lock.until;
      }
    }
    return lockData;
  };

  getCurrentHeight = async () => {
    const header = await this.oneSatSPV.getSyncedBlock();
    return header?.height || 0;
  };

  getLockedTxos = async () => {
    const lockTxos = await this.oneSatSPV.search(new TxoLookup('lock'));
    return lockTxos.txos;
  };

  rate = async () => {
    const r = await this.wocService.getExchangeRate();
    this.exchangeRate = r ?? 0;
  };

  unlockLockedCoins = async (balanceOnly = false) => {
    if (!this.keysService.identityAddress) return;
    const blockHeight = await this.getCurrentHeight();
    const lockedTxos = await this.getLockedTxos();
    const txos = lockedTxos.filter((i) => Number(i.data.lock?.data.until) <= blockHeight);
    if (txos.length > 0) {
      return await this.contractService.unlock(txos, blockHeight);
    }
  };

  // TODO: Reimplement SendAll
  sendBsv = async (request: SendBsv[], password: string, noApprovalLimit?: number): Promise<InWalletBsvResponse> => {
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
      if (!keys?.walletAddress) throw Error('Undefined key');
      const changeAddress = keys.walletAddress;
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);
      const amount = request.reduce((a, r) => a + r.satoshis, 0);

      // Build tx
      const tx = new Transaction();
      let satsOut = 0;
      // const paymailRefs: { paymail: string; reference: string }[] = [];
      for (const req of request) {
        let outScript: Script;
        if (req.address) {
          if (req.inscription) {
            const { base64Data, mimeType, map } = req.inscription;
            const formattedBase64 = removeBase64Prefix(base64Data);

            outScript = new OrdP2PKH().lock(
              req.address,
              {
                dataB64: formattedBase64,
                contentType: mimeType,
              },
              map,
            );
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
        } else if (!req.paymail) {
          throw Error('Invalid request');
        }

        satsOut += req.satoshis;
        if (!req.paymail) {
          tx.addOutput({
            satoshis: req.satoshis,
            lockingScript: outScript!,
          });
        } else {
          throw Error('Paymail not implemented');
          // const p2pDestination = await client.getP2pPaymentDestination(req.paymail, req.satoshis);
          // console.log(p2pDestination);
          // paymailRefs.push({ paymail: req.paymail, reference: p2pDestination.reference });
          // for (const output of p2pDestination.outputs) {
          //   tx.addOutput({
          //     satoshis: output.satoshis,
          //     lockingScript: Script.fromHex(output.script),
          //   });
          // }
        }
      }

      tx.addOutput({
        lockingScript: new P2PKH().lock(changeAddress),
        change: true,
      });

      const fundResults = await this.oneSatSPV.search(new TxoLookup('fund'));

      let satsIn = 0;
      let fee = 0;
      const feeModel = new SatoshisPerKilobyte(FEE_PER_KB);
      for await (const u of fundResults.txos || []) {
        const pk = pkMap.get(u.owner || '');
        if (!pk) continue;
        tx.addInput({
          sourceTransaction: await this.oneSatSPV.getTx(u.outpoint.txid),
          sourceOutputIndex: u.outpoint.vout,
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(pk),
        });
        satsIn += Number(u.satoshis);
        fee = await feeModel.computeFee(tx);
        if (satsIn >= satsOut + fee) break;
      }
      if (satsIn < satsOut + fee) return { error: 'insufficient-funds' };
      await tx.fee(feeModel);
      await tx.sign();

      // Size checker
      const bytes = tx.toBinary().length;
      if (bytes > MAX_BYTES_PER_TX) return { error: 'tx-size-too-large' };

      const response = await this.oneSatSPV.broadcast(tx);

      // const txHex = tx.toHex();
      // for (const ref of paymailRefs) {
      //   await client.sendTransactionP2P(ref.paymail, txHex, ref.reference);
      // }

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
      const address = publicKey.toAddress([
        network == NetWork.Mainnet ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
      ]);

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
    signatureBase64: string,
    publicKeyHex: string,
    encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  ) => {
    try {
      const msgBuf = Buffer.from(message, encoding);
      const publicKey = PublicKey.fromString(publicKeyHex);
      const signature = Signature.fromCompact(Utils.toArray(signatureBase64, 'base64'));
      return BSM.verify(Array.from(msgBuf), signature, publicKey);
    } catch (error) {
      console.error(error);
      return false;
    }
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
    const results = await this.oneSatSPV.search(new TxoLookup('fund'));
    return results.txos;
  };

  fundRawTx = async (rawtx: string, password: string): Promise<FundRawTxResponse> => {
    const isAuthenticated = await this.keysService.verifyPassword(password);
    if (!isAuthenticated) {
      return { error: 'invalid-password' };
    }

    const pkMap = await this.keysService.retrievePrivateKeyMap(password);
    const tx = Transaction.fromHex(rawtx);

    let satsIn = 0;
    for (const input of tx.inputs) {
      input.sourceTransaction = await this.oneSatSPV.getTx(input.sourceTXID ?? '', true);
      satsIn += input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis || 0;
    }

    const satsOut = tx.outputs.reduce((a, o) => a + (o.satoshis || 0), 0);
    let fee = 0;
    tx.addOutput({ change: true, lockingScript: new P2PKH().lock(this.keysService.bsvAddress) });

    const fundResults = await this.oneSatSPV.search(new TxoLookup('fund'));

    const feeModel = new SatoshisPerKilobyte(FEE_PER_KB);
    for await (const u of fundResults.txos || []) {
      const pk = pkMap.get(u.owner || '');
      if (!pk) continue;
      tx.addInput({
        sourceTransaction: await this.oneSatSPV.getTx(u.outpoint.txid),
        sourceOutputIndex: u.outpoint.vout,
        sequence: 0xffffffff,
        unlockingScriptTemplate: new P2PKH().unlock(pk),
      });
      satsIn += Number(u.satoshis);
      fee = await feeModel.computeFee(tx);
      if (satsIn >= satsOut + fee) break;
    }
    if (satsIn < satsOut + fee) return { error: 'insufficient-funds' };
    await tx.fee(feeModel);
    await tx.sign();

    return { rawtx: tx.toHex() };
  };
}
