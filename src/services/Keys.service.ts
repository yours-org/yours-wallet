import { NetWork } from './types/provider.types';
import {
  DEFAULT_RELAYX_ORD_PATH,
  DEFAULT_TWETCH_WALLET_PATH,
  DEFAULT_ACCOUNT,
  SWEEP_PATH,
  CHROME_STORAGE_OBJECT_VERSION,
} from '../utils/constants';
import { decrypt, deriveKey, encrypt, generateRandomSalt } from '../utils/crypto';
import { generateKeysFromTag, getKeys, getKeysFromWifs, Keys } from '../utils/keys';
import { ChromeStorageService } from './ChromeStorage.service';
import { ChromeStorageObject } from './types/chromeStorage.types';
import { SupportedWalletImports, WifKeys } from './types/keys.types';
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction } from '@bsv/sdk';
import { OneSatServices } from '@1sat/wallet-browser';
import { getNetworkConfig, toNetworkAddress } from '../utils/network';

export class KeysService {
  bsvAddress: string;
  ordAddress: string;
  identityAddress: string;
  bsvPubKey: string;
  ordPubKey: string;
  identityPubKey: string;
  constructor(private readonly chromeStorageService: ChromeStorageService) {
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
    const currentChromeObj = await this.chromeStorageService.getAndSetStorage();
    const totalAccounts = this.chromeStorageService.getAllAccounts().length;
    const accountNumber = currentChromeObj?.accountNumber ? currentChromeObj.accountNumber + 1 : totalAccounts + 1;
    await this.chromeStorageService.update({
      selectedAccount: keys.identityAddress,
      salt,
      version: CHROME_STORAGE_OBJECT_VERSION,
      showWelcome: false,
      deviceId: crypto.randomUUID(),
      accountNumber,
    });
    // passKey goes to session storage (memory-only, not written to disk)
    await this.chromeStorageService.setPassKey(passKey);
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [keys.identityAddress]: {
        ...DEFAULT_ACCOUNT,
        network,
        storageConfig: network === NetWork.Testnet ? {} : DEFAULT_ACCOUNT.storageConfig,
        name: `Account ${accountNumber}`,
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
    let salt: string | undefined;
    let passKey: string | undefined;

    if (!isNewWallet) {
      const isVerified = await this.verifyPassword(password);
      if (!isVerified) throw new Error('Unauthorized!');
      const { salt: existingSalt } = this.chromeStorageService.getCurrentAccountObject();
      salt = existingSalt;
      // verifyPassword stores passKey in session storage on success
      passKey = await this.chromeStorageService.getPassKey();
      if (!salt || !passKey) throw new Error('Credentials not found');
    } else {
      const acctObj = this.chromeStorageService.getCurrentAccountObject();
      salt = acctObj?.salt || generateRandomSalt();
      passKey = deriveKey(password, salt);
    }

    if (!salt) throw new Error('Salt not found');
    if (!passKey) throw new Error('Passkey not found');
    return { passKey, salt };
  };

  generateSeedAndStoreEncrypted = async (
    password: string,
    isNewWallet: boolean,
    network = NetWork.Mainnet,
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

    const keys = getKeys(mnemonic, walletDerivation, ordDerivation, identityDerivation, network);
    if (mnemonic) {
      this.sweepLegacy(keys, network);
    }
    const encryptedKeys = await encrypt(JSON.stringify(keys), passKey);
    await this.storeEncryptedKeys(passKey, salt, keys, encryptedKeys, network);
    return keys;
  };

  /**
   * Sweep any BSV sitting at the old default derivation path (SWEEP_PATH)
   * into the current wallet address. This unifies imported mnemonics into
   * the shape Yours wallet expects before the user-facing SweepMigration runs.
   *
   * Fire-and-forget — failures are logged but don't block onboarding.
   */
  private sweepLegacy = async (keys: Keys, network: NetWork) => {
    try {
      const sweepWallet = generateKeysFromTag(keys.mnemonic, SWEEP_PATH, network);
      const services = new OneSatServices(getNetworkConfig(network).chain);

      // Trigger the indexer to process this address before querying
      for await (const event of services.owner.getTxos(sweepWallet.address, { refresh: true, limit: 1 })) {
        if (event.type === 'done' || event.type === 'error') break;
      }

      const utxos =
        (await services.txo.search(`own:${sweepWallet.address}`, {
          unspent: true,
          sats: true,
          limit: 0,
        })) ?? [];
      if (utxos.length === 0) return;

      const tx = new Transaction();
      tx.addOutput({ lockingScript: new P2PKH().lock(keys.walletAddress), change: true });

      for (const u of utxos) {
        const [txid, voutStr] = u.outpoint.split(/[._]/);
        const rawTx = await services.beef.getRawTx(txid);
        if (!rawTx.length) continue;
        const sourceTransaction = Transaction.fromBinary([...rawTx]);
        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: parseInt(voutStr),
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(sweepWallet.privKey),
        });
      }

      if (tx.inputs.length === 0) return;

      await tx.fee(new SatoshisPerKilobyte(this.chromeStorageService.getCustomFeeRate()));
      await tx.sign();
      await services.submitToStack(tx.toBinary());
      console.log('Legacy sweep:', tx.id('hex'));
    } catch (error) {
      console.error('sweepLegacy failed:', error);
    }
  };

  generateKeysFromWifAndStoreEncrypted = async (
    password: string,
    wifs: WifKeys,
    isNewWallet: boolean,
    network = NetWork.Mainnet,
  ) => {
    const { passKey, salt } = await this.getPassKeyAndSalt(password, isNewWallet);
    const keys = getKeysFromWifs(wifs, network);
    const encryptedKeys = await encrypt(JSON.stringify(keys), passKey);
    await this.storeEncryptedKeys(passKey, salt, keys as Keys, encryptedKeys, network);
    return keys;
  };

  retrieveKeys = async (password?: string): Promise<Keys | Partial<Keys>> => {
    // Verify password before decrypting any key material
    if (password) {
      const isVerified = await this.verifyPassword(password);
      if (!isVerified) throw new Error('Unauthorized!');
    }

    const { account } = this.chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account found!');
    const { encryptedKeys } = account;
    const passKey = await this.chromeStorageService.getPassKey();
    try {
      if (!encryptedKeys || !passKey) throw new Error('No keys found!');
      const d = await decrypt(encryptedKeys, passKey);
      const keys: Keys = JSON.parse(d);

      const network = account.network ?? NetWork.Mainnet;
      const walletAddr = toNetworkAddress(keys.walletAddress, network);
      const ordAddr = toNetworkAddress(keys.ordAddress, network);
      const identityAddr = keys.identityAddress ? toNetworkAddress(keys.identityAddress, network) : '';

      this.bsvAddress = walletAddr;
      this.ordAddress = ordAddr;
      this.identityAddress = identityAddr;
      this.bsvPubKey = keys.walletPubKey;
      this.ordPubKey = keys.ordPubKey;
      this.identityPubKey = keys.identityPubKey ?? '';

      return Object.assign({}, keys, {
        ordAddress: ordAddr,
        walletAddress: walletAddr,
        ...(identityAddr ? { identityAddress: identityAddr } : {}),
      });
    } catch (error) {
      console.error('Error in retrieveKeys:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Failed to retrieve keys');
    }
  };

  retrievePrivateKeyMap = async (password?: string): Promise<Map<string, PrivateKey>> => {
    const keys = await this.retrieveKeys(password);
    const pkMap = new Map<string, PrivateKey>();
    if (keys.walletAddress && keys.walletWif) pkMap.set(keys.walletAddress, PrivateKey.fromWif(keys.walletWif));
    if (keys.ordAddress && keys.ordWif) pkMap.set(keys.ordAddress, PrivateKey.fromWif(keys.ordWif));
    if (keys.identityAddress && keys.identityWif) pkMap.set(keys.identityAddress, PrivateKey.fromWif(keys.identityWif));
    return pkMap;
  };

  verifyPassword = async (password: string): Promise<boolean> => {
    return this.chromeStorageService.verifyPassword(password);
  };
}
