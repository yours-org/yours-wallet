import { NetWork } from 'yours-wallet-provider';
import {
  DEFAULT_RELAYX_ORD_PATH,
  DEFAULT_TWETCH_WALLET_PATH,
  DEFAULT_ACCOUNT,
  MAINNET_ADDRESS_PREFIX,
  TESTNET_ADDRESS_PREFIX,
  SWEEP_PATH,
  FEE_PER_KB,
  WOC_BASE_URL,
} from '../utils/constants';
import { decrypt, deriveKey, encrypt, generateRandomSalt } from '../utils/crypto';
import { generateKeysFromTag, getKeys, getKeysFromWifs, Keys } from '../utils/keys';
import { ChromeStorageService } from './ChromeStorage.service';
import { Account, ChromeStorageObject } from './types/chromeStorage.types';
import { SupportedWalletImports, WifKeys } from './types/keys.types';
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction, Utils } from '@bsv/sdk';
import { CaseModSPV } from 'ts-casemod-spv';
import { WocUtxo } from './types/whatsOnChain.types';
import axios from 'axios';

export class KeysService {
  bsvAddress: string;
  ordAddress: string;
  identityAddress: string;
  bsvPubKey: string;
  ordPubKey: string;
  identityPubKey: string;
  constructor(
    private readonly chromeStorageService: ChromeStorageService,
    private readonly oneSatSPV: CaseModSPV,
  ) {
    this.bsvAddress = '';
    this.ordAddress = '';
    this.identityAddress = '';
    this.bsvPubKey = '';
    this.ordPubKey = '';
    this.identityPubKey = '';
  }

  private storeEncryptedKeys = async (
    passKey: string,
    salt: string,
    keys: Keys,
    encryptedKeys: string,
    network: NetWork,
  ) => {
    await this.chromeStorageService.update({ selectedAccount: keys.identityAddress, passKey, salt });
    const { account } = this.chromeStorageService.getCurrentAccountObject();
    const newAccount: Account = account ? account : DEFAULT_ACCOUNT;
    const totalAccounts = this.chromeStorageService.getAllAccounts().length;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [keys.identityAddress]: {
        ...newAccount,
        network,
        name: `Account ${totalAccounts + 1}`,
        addresses: {
          bsvAddress: keys.walletAddress,
          identityAddress: keys.identityAddress,
          ordAddress: keys.ordAddress,
        },
        pubKeys: {
          bsvPubKey: keys.walletPubKey,
          ordPubKey: keys.ordPubKey,
          identityPubKey: keys.identityPubKey,
        },
        encryptedKeys,
      },
    };
    await this.chromeStorageService.updateNested(key, update);
  };

  private getPassKeyAndSalt = async (password: string, isNewWallet: boolean) => {
    let acctObj: Partial<ChromeStorageObject> | undefined = {};
    if (!isNewWallet) {
      const isVerified = await this.verifyPassword(password);
      if (!isVerified) throw new Error('Unauthorized!');
      const accountObject = this.chromeStorageService.getCurrentAccountObject();
      acctObj = accountObject;
      if (!acctObj?.salt || !acctObj?.passKey) throw new Error('Credentials not found');
    }
    const salt = isNewWallet && !acctObj?.salt ? generateRandomSalt() : acctObj.salt;
    if (!salt) throw new Error('Salt not found');
    const passKey = isNewWallet ? deriveKey(password, salt) : acctObj.passKey;
    if (!passKey) throw new Error('Passkey not found');
    return { passKey, salt };
  };

  generateSeedAndStoreEncrypted = async (
    password: string,
    isNewWallet: boolean,
    network: NetWork = NetWork.Mainnet,
    mnemonic?: string,
    walletDerivation: string | null = null,
    ordDerivation: string | null = null,
    identityDerivation: string | null = null,
    importWallet?: SupportedWalletImports,
  ) => {
    const { passKey, salt } = await this.getPassKeyAndSalt(password, isNewWallet);
    switch (importWallet) {
      case 'relayx':
        ordDerivation = DEFAULT_RELAYX_ORD_PATH;
        break;
      case 'twetch':
        walletDerivation = DEFAULT_TWETCH_WALLET_PATH;
        break;
    }

    const keys = getKeys(network, mnemonic, walletDerivation, ordDerivation, identityDerivation);
    if (mnemonic) {
      this.sweepLegacy(keys);
    }
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    await this.storeEncryptedKeys(passKey, salt, keys, encryptedKeys, network);
    return keys;
  };

  sweepLegacy = async (keys: Keys) => {
    try {
      const sweepWallet = generateKeysFromTag(keys.mnemonic, SWEEP_PATH);
      const tx = new Transaction();
      const outScript = new P2PKH().lock(keys.walletAddress);
      tx.addOutput({ lockingScript: outScript, change: true });

      const { data } = await axios.get<WocUtxo[]>(`${WOC_BASE_URL}/address/${sweepWallet.address}/unspent`);
      const utxos = data;
      if (utxos.length === 0) return;
      const feeModel = new SatoshisPerKilobyte(FEE_PER_KB);
      for await (const u of utxos || []) {
        tx.addInput({
          sourceTransaction: await this.oneSatSPV.getTx(u.tx_hash),
          sourceOutputIndex: u.tx_pos,
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(sweepWallet.privKey),
        });
      }
      await tx.fee(feeModel);
      await tx.sign();
      const response = await this.oneSatSPV.broadcast(tx);
      if (response.status == 'error') return { error: response.description };
      const txid = tx.id('hex');
      console.log('Change sweep:', txid);
      return { txid, rawtx: Utils.toHex(tx.toBinary()) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log(error);
    }
  };

  generateKeysFromWifAndStoreEncrypted = async (password: string, wifs: WifKeys, isNewWallet: boolean) => {
    const { passKey, salt } = await this.getPassKeyAndSalt(password, isNewWallet);
    const keys = getKeysFromWifs(wifs);
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    await this.storeEncryptedKeys(passKey, salt, keys as Keys, encryptedKeys, NetWork.Mainnet);
    return keys;
  };

  retrieveKeys = async (password?: string, isBelowNoApprovalLimit?: boolean): Promise<Keys | Partial<Keys>> => {
    const accountObj = this.chromeStorageService.getCurrentAccountObject();
    const { account, passKey } = accountObj;
    if (!account) throw new Error('No account found!');
    if (!account.network) throw new Error('No network found!');
    const { encryptedKeys } = account;
    const { isPasswordRequired } = account.settings;
    try {
      if (!encryptedKeys || !passKey) throw new Error('No keys found!');
      const d = decrypt(encryptedKeys, passKey);
      const keys: Keys = JSON.parse(d);

      const walletAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.walletAddress).data as number[], [
        account.network === NetWork.Mainnet ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
      ]);

      const ordAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.ordAddress).data as number[], [
        account.network === NetWork.Mainnet ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
      ]);

      this.bsvAddress = walletAddr;
      this.ordAddress = ordAddr;
      this.bsvPubKey = keys.walletPubKey;
      this.ordPubKey = keys.ordPubKey;

      // identity address not available with wif or 1sat import
      if (keys.identityAddress) {
        const identityAddr = Utils.toBase58Check(Utils.fromBase58Check(keys.identityAddress).data as number[], [
          account.network === NetWork.Mainnet ? MAINNET_ADDRESS_PREFIX : TESTNET_ADDRESS_PREFIX,
        ]);

        this.identityAddress = identityAddr;
        this.identityPubKey = keys.identityPubKey;
      }

      if (!isPasswordRequired || isBelowNoApprovalLimit || password) {
        const isVerified = isBelowNoApprovalLimit || !isPasswordRequired || (await this.verifyPassword(password ?? ''));
        if (isVerified) {
          return Object.assign({}, keys, {
            ordAddress: ordAddr,
            walletAddress: walletAddr,
          });
        } else throw new Error('Unauthorized!');
      } else {
        return {
          ordAddress: ordAddr,
          walletAddress: walletAddr,
          walletPubKey: keys.walletPubKey,
          ordPubKey: keys.ordPubKey,
        };
      }
    } catch (error) {
      console.error('Error in retrieveKeys:', error);
      throw new Error('Failed to retrieve keys');
    }
  };

  retrievePrivateKeyMap = async (
    password?: string,
    isBelowNoApprovalLimit?: boolean,
  ): Promise<Map<string, PrivateKey>> => {
    const keys = await this.retrieveKeys(password, isBelowNoApprovalLimit);
    const pkMap = new Map<string, PrivateKey>();
    if (keys.walletAddress && keys.walletWif) pkMap.set(keys.walletAddress, PrivateKey.fromWif(keys.walletWif));
    if (keys.ordAddress && keys.ordWif) pkMap.set(keys.ordAddress, PrivateKey.fromWif(keys.ordWif));
    if (keys.identityAddress && keys.identityWif) pkMap.set(keys.identityAddress, PrivateKey.fromWif(keys.identityWif));
    return pkMap;
  };

  verifyPassword = async (password: string): Promise<boolean> => {
    const isRequired = this.chromeStorageService.isPasswordRequired();
    if (!isRequired) return true;
    const { salt, passKey } = this.chromeStorageService.getCurrentAccountObject();
    if (!salt || !passKey) return false;
    try {
      const derivedKey = deriveKey(password, salt);
      return derivedKey === passKey;
    } catch (error) {
      return false;
    }
  };
}
