import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';
import {
  BSV20Data,
  BuildAndBroadcastResponse,
  ListOrdinal,
  OrdinalData,
  OrdOperationResponse,
} from './types/ordinal.types';
import { sendOrdinals } from 'js-1sat-ord';
import { Bsv20, Ordinal, PurchaseOrdinal } from 'yours-wallet-provider';
import { UTXO } from './types/bsv.types';
import { ChromeStorageService } from './ChromeStorage.service';
import { TxoStore } from './txo-store';
import { PrivateKey, Transaction } from '@bsv/sdk';
import { BsvService } from './Bsv.service';
import { FEE_PER_KB } from '../utils/constants';

export class OrdinalService {
  private ordinals: OrdinalData;
  private bsv20s: BSV20Data;
  constructor(
    private readonly keysService: KeysService,
    private readonly gorillaPoolService: GorillaPoolService,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly bsvService: BsvService,
    private readonly txoStore: TxoStore,
  ) {
    this.ordinals = { initialized: false, data: [] };
    this.bsv20s = { initialized: false, data: [] };
  }

  getOrdinals = (): OrdinalData => this.ordinals;
  getBsv20s = (): BSV20Data => this.bsv20s;

  // getAndSetOrdinals = async (ordAddress: string) => {
  //   try {
  //     //TODO: Implement infinite scroll to handle instances where user has more than 100 items.
  //     const ordList = await this.gorillaPoolService.getOrdUtxos(ordAddress);
  //     this.ordinals = { initialized: true, data: ordList.filter((o) => o.satoshis === 1) };

  //     const bsv20List: Array<Bsv20> = await this.gorillaPoolService.getBsv20Balances(ordAddress);

  //     // All the information currently used has been obtained from `getBsv20Balances`.
  //     // If other information is needed later, call `cacheTokenInfos` to obtain more Tokens information.
  //     // await cacheTokenInfos(bsv20List.map((bsv20) => bsv20.id));

  //     const data = bsv20List.filter((o) => o.all.confirmed + o.all.pending > 0n && typeof o.dec === 'number');
  //     this.bsv20s = { initialized: true, data };
  //     const { account } = this.chromeStorageService.getCurrentAccountObject();
  //     if (!account) throw Error('No account found!');
  //     const key: keyof ChromeStorageObject = 'accounts';
  //     const update: Partial<ChromeStorageObject['accounts']> = {
  //       [this.keysService.identityAddress]: {
  //         ...account,
  //         ordinals: this.ordinals.initialized ? this.ordinals.data : account.ordinals || [],
  //       },
  //     };
  //     await this.chromeStorageService.updateNested(key, update);
  //     return this.ordinals;
  //   } catch (error) {
  //     console.error('getOrdinals failed:', error);
  //   }
  // };

  transferOrdinal = async (
    destinationAddress: string,
    outpoint: string,
    password: string,
  ): Promise<OrdOperationResponse> => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }

      const [txid, vout] = outpoint.split('_');
      const ordinal = await this.txoStore.getTxo(txid, parseInt(vout, 10));
      if (!ordinal) {
        return { error: 'no-ordinal' };
      }

      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        throw Error('No keys');
      }

      const ordPk = PrivateKey.fromWif(keys.ordWif);
      const fundingAndChangeAddress = keys.walletAddress;
      const payPk = PrivateKey.fromWif(keys.walletWif);

      const fundingUtxos = await this.bsvService.fundingTxos();
      const { tx } = await sendOrdinals({
        destinations: [{ address: destinationAddress }],
        ordinals: [
          { txid, vout: parseInt(vout, 10), satoshis: 1, script: Buffer.from(ordinal.script).toString('base64') },
        ],
        ordPk,
        paymentPk: payPk,
        paymentUtxos: fundingUtxos.map((t) => ({
          txid: t.txid,
          vout: t.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        changeAddress: fundingAndChangeAddress,
        satsPerKb: FEE_PER_KB,
      });

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

  buildAndBroadcastOrdinalTx = async (
    fundingUtxo: UTXO,
    ordUtxo: UTXO,
    payPrivateKey: PrivateKey,
    fundingAndChangeAddress: string,
    ordPrivateKey: PrivateKey,
    destination: string,
  ): Promise<BuildAndBroadcastResponse | undefined> => {
    // fundingUtxo.script = Script.from_hex(fundingUtxo.script).to_asm_string();
    // ordUtxo.script = Script.from_hex(ordUtxo.script).to_asm_string();
    // const sendRes = await sendOrdinal(
    //   fundingUtxo,
    //   ordUtxo,
    //   payPrivateKey,
    //   fundingAndChangeAddress,
    //   FEE_PER_BYTE,
    //   ordPrivateKey,
    //   destination,
    // );

    // const rawTx = sendRes.to_hex();
    // const tx = Transaction.from_hex(rawTx);

    // const changeVout = tx.get_noutputs() ? tx.get_noutputs() - 1 : 1; // The change should be at vout position 1 if the other requests fail
    // const change = Number(tx.get_output(changeVout)?.get_satoshis()) ?? 0;
    // const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(rawTx);

    // if (txid) {
    //   return { txid, rawTx, changeInfo: { change, changeVout } };
    // }
    return;
  };

  sendBSV20 = async (id: string, destinationAddress: string, amount: bigint, password: string) => {
    // let indexFee = BSV20_INDEX_FEE;
    // try {
    //   const isAuthenticated = await this.keysService.verifyPassword(password);
    //   if (!isAuthenticated) {
    //     return { error: 'invalid-password' };
    //   }
    //   const keys = await this.keysService.retrieveKeys(password);
    //   if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
    //     throw Error('No keys');
    //   }
    //   const ordinalAddress = keys.ordAddress;
    //   const ordWifPk = keys.ordWif;
    //   const fundingAndChangeAddress = keys.walletAddress;
    //   const payWifPk = keys.walletWif;
    //   const paymentPk = PrivateKey.from_wif(payWifPk);
    //   const ordPk = PrivateKey.from_wif(ordWifPk);
    //   const fundingUtxos = await this.wocService.getAndUpdateUtxoStorage(fundingAndChangeAddress);
    //   if (!fundingUtxos || fundingUtxos.length === 0) {
    //     return { error: 'insufficient-funds' };
    //   }
    //   const tokenDetails = await this.gorillaPoolService.getBsv20Details(id);
    //   if (!tokenDetails) {
    //     return { error: 'token-details' };
    //   }
    //   const bsv20Utxos = await this.gorillaPoolService.getBSV20Utxos(id, ordinalAddress);
    //   if (!bsv20Utxos || bsv20Utxos.length === 0) throw Error('no-bsv20-utxo');
    //   const isV2 = isBSV20v2(id);
    //   //TODO: should consider updating this to only use what is required for the amount.
    //   const tokenTotalAmt = bsv20Utxos.reduce((a, item) => {
    //     return a + BigInt(item.amt);
    //   }, 0n);
    //   if (amount > tokenTotalAmt) {
    //     return { error: 'insufficient-funds' };
    //   }
    //   const tokenChangeAmt = tokenTotalAmt - amount;
    //   const tx = new Transaction(1, 0);
    //   tx.add_output(
    //     new TxOut(
    //       1n,
    //       isV2
    //         ? createTransferV2P2PKH(destinationAddress, id, amount)
    //         : createTransferP2PKH(destinationAddress, id, amount),
    //     ),
    //   );
    //   if (tokenChangeAmt > 0n) {
    //     indexFee += BSV20_INDEX_FEE;
    //     tx.add_output(
    //       new TxOut(
    //         1n,
    //         isV2
    //           ? createTransferV2P2PKH(ordinalAddress, id, tokenChangeAmt)
    //           : createTransferP2PKH(ordinalAddress, id, tokenChangeAmt),
    //       ),
    //     );
    //   }
    //   tx.add_output(
    //     new TxOut(BigInt(indexFee), P2PKHAddress.from_string(tokenDetails.fundAddress).get_locking_script()),
    //   );
    //   const fundingUtxo = this.wocService.getSuitableUtxo(fundingUtxos, FEE_SATS + indexFee);
    //   const totalInputSats = fundingUtxo.satoshis;
    //   const change = totalInputSats - 1 - FEE_SATS - indexFee;
    //   if (change > 0) {
    //     tx.add_output(
    //       new TxOut(BigInt(change), P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script()),
    //     );
    //   }
    //   let idx = 0;
    //   for (const u of bsv20Utxos || []) {
    //     if (!u?.script) throw Error('No script');
    //     const script = Script.from_bytes(Buffer.from(u.script, 'base64'));
    //     const inTx = new TxIn(Buffer.from(u.txid, 'hex'), u.vout, Script.from_hex(''));
    //     inTx.set_satoshis(BigInt(1));
    //     inTx.set_locking_script(script);
    //     tx.add_input(inTx);
    //     const sig = tx.sign(ordPk, SigHash.InputOutputs, idx, script, BigInt(1));
    //     inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`));
    //     tx.set_input(idx, inTx);
    //     idx++;
    //   }
    //   const inTx = new TxIn(Buffer.from(fundingUtxo.txid, 'hex'), fundingUtxo.vout, Script.from_hex(''));
    //   inTx.set_satoshis(BigInt(fundingUtxo.satoshis));
    //   const fundingScript = Script.from_hex(fundingUtxo.script);
    //   inTx.set_locking_script(fundingScript);
    //   tx.add_input(inTx);
    //   const sig = tx.sign(paymentPk, SigHash.InputOutputs, idx, fundingScript, BigInt(fundingUtxo.satoshis));
    //   inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
    //   tx.set_input(idx, inTx);
    //   // Fee checker
    //   const finalSatsIn = tx.satoshis_in() ?? 0n;
    //   const finalSatsOut = tx.satoshis_out() ?? 0n;
    //   if (finalSatsIn - finalSatsOut > MAX_FEE_PER_TX) return { error: 'fee-too-high' };
    //   const txhex = tx.to_hex();
    //   const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(txhex);
    //   if (!txid) return { error: 'broadcast-transaction-failed' };
    //   return { txid };
    //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // } catch (error: any) {
    //   console.error('sendBSV20 failed:', error);
    //   return { error: error.message ?? 'unknown' };
    // }
  };

  listOrdinalOnGlobalOrderbook = async (listing: ListOrdinal): Promise<OrdOperationResponse> => {
    // try {
    //   const { outpoint, price, password } = listing;
    //   const isAuthenticated = await this.keysService.verifyPassword(password);
    //   if (!isAuthenticated) {
    //     return { error: 'invalid-password' };
    //   }
    //   const keys = await this.keysService.retrieveKeys(password);

    //   if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

    //   const fundingAndChangeAddress = this.keysService.bsvAddress;
    //   const paymentPk = PrivateKey.from_wif(keys.walletWif);
    //   const ordPk = PrivateKey.from_wif(keys.ordWif);

    //   const paymentUtxos = await this.wocService.getAndUpdateUtxoStorage(fundingAndChangeAddress);

    //   if (!paymentUtxos.length) {
    //     throw new Error('Could not retrieve paymentUtxos');
    //   }

    //   const totalSats = paymentUtxos.reduce((a: number, utxo: UTXO) => a + utxo.satoshis, 0);

    //   if (totalSats < FEE_SATS) {
    //     return { error: 'insufficient-funds' };
    //   }

    //   const paymentUtxo = this.wocService.getSuitableUtxo(paymentUtxos, FEE_SATS);

    //   const ordUtxo = await this.gorillaPoolService.getUtxoByOutpoint(outpoint);

    //   if (!ordUtxo) return { error: 'no-ord-utxo' };

    //   const rawTx = await this.listOrdinal(
    //     paymentUtxo,
    //     ordUtxo,
    //     paymentPk,
    //     fundingAndChangeAddress,
    //     ordPk,
    //     this.keysService.ordAddress,
    //     fundingAndChangeAddress,
    //     Number(price),
    //   );

    //   const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(rawTx);
    //   if (!txid) return { error: 'broadcast-error' };
    return { txid: '' };
    // } catch (error) {
    //   console.log(error);
    //   return { error: JSON.stringify(error) };
    // }
  };

  createChangeOutput(tx: Transaction, changeAddress: string, paymentSatoshis: number) {
    // const changeaddr = P2PKHAddress.from_string(changeAddress);
    // const changeScript = changeaddr.get_locking_script();
    // const emptyOut = new TxOut(BigInt(1), changeScript);
    // const fee = Math.ceil(FEE_PER_BYTE * (tx.get_size() + emptyOut.to_bytes().byteLength));
    // const change = paymentSatoshis - fee;
    // const changeOut = new TxOut(BigInt(change), changeScript);
    // return changeOut;
    return;
  }

  async listOrdinal(
    paymentUtxo: UTXO,
    ordinal: Ordinal,
    paymentPk: PrivateKey,
    changeAddress: string,
    ordPk: PrivateKey,
    ordAddress: string,
    payoutAddress: string,
    satoshisPayout: number,
  ) {
    // const tx = new Transaction(1, 0);
    // const t = ordinal.txid;
    // const txBuf = Buffer.from(t, 'hex');
    // const ordIn = new TxIn(txBuf, ordinal.vout, Script.from_hex(''));
    // tx.add_input(ordIn);

    // const utxoIn = new TxIn(Buffer.from(paymentUtxo.txid, 'hex'), paymentUtxo.vout, Script.from_hex(''));

    // tx.add_input(utxoIn);

    // const payoutDestinationAddress = P2PKHAddress.from_string(payoutAddress);
    // const payOutput = new TxOut(BigInt(satoshisPayout), payoutDestinationAddress.get_locking_script());

    // const destinationAddress = P2PKHAddress.from_string(ordAddress);
    // const addressHex = destinationAddress.get_locking_script().to_asm_string().split(' ')[2];

    // const ordLockScript = `${Script.from_hex(
    //   SCRYPT_PREFIX,
    // ).to_asm_string()} ${addressHex} ${payOutput.to_hex()} ${Script.from_hex(O_LOCK_SUFFIX).to_asm_string()}`;

    // const satOut = new TxOut(BigInt(1), Script.from_asm_string(ordLockScript));
    // tx.add_output(satOut);

    // const changeOut = this.createChangeOutput(tx, changeAddress, paymentUtxo.satoshis);
    // tx.add_output(changeOut);

    // if (!ordinal.script) {
    //   const ordRawTxHex = await this.wocService.getRawTxById(ordinal.txid);
    //   if (!ordRawTxHex) throw new Error('Could not get raw hex');
    //   const tx = Transaction.from_hex(ordRawTxHex);
    //   const out = tx.get_output(ordinal.vout);
    //   ordinal.satoshis = Number(out?.get_satoshis());

    //   const script = out?.get_script_pub_key();
    //   if (script) {
    //     ordinal.script = script.to_hex();
    //   }
    // }

    // if (!ordinal.script) throw new Error('Script not found');

    // const sig = tx.sign(
    //   ordPk,
    //   SigHash.ALL | SigHash.FORKID,
    //   0,
    //   Script.from_hex(ordinal.script),
    //   BigInt(ordinal.satoshis),
    // );

    // ordIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`));

    // tx.set_input(0, ordIn);

    // const sig2 = tx.sign(
    //   paymentPk,
    //   SigHash.ALL | SigHash.FORKID,
    //   1,
    //   P2PKHAddress.from_string(payoutAddress).get_locking_script(),
    //   BigInt(paymentUtxo.satoshis),
    // );

    // utxoIn.set_unlocking_script(Script.from_asm_string(`${sig2.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
    // tx.set_input(1, utxoIn);
    // return tx.to_hex();
    return;
  }

  async cancelGlobalOrderbookListing(outpoint: string, password: string): Promise<OrdOperationResponse> {
    // try {
    //   const isAuthenticated = await this.keysService.verifyPassword(password);
    //   if (!isAuthenticated) {
    //     return { error: 'invalid-password' };
    //   }
    //   const keys = await this.keysService.retrieveKeys(password);

    //   if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
    //   const fundingAndChangeAddress = this.keysService.bsvAddress;

    //   const paymentUtxos = await this.wocService.getAndUpdateUtxoStorage(fundingAndChangeAddress);

    //   if (!paymentUtxos.length) {
    //     throw new Error('Could not retrieve paymentUtxos');
    //   }

    //   const paymentUtxo = this.wocService.getSuitableUtxo(paymentUtxos, FEE_SATS);

    //   const paymentPk = PrivateKey.from_wif(keys.walletWif);
    //   const ordinalPk = PrivateKey.from_wif(keys.ordWif);

    //   const listingTxid = outpoint.split('_')[0];
    //   if (!listingTxid) {
    //     throw new Error('No listing txid');
    //   }

    //   const cancelTx = new Transaction(1, 0);

    //   const { script } = await this.gorillaPoolService.getMarketData(outpoint);

    //   const ordIn = new TxIn(Buffer.from(listingTxid, 'hex'), 0, Script.from_hex(''));
    //   cancelTx.add_input(ordIn);

    //   const utxoIn = new TxIn(Buffer.from(paymentUtxo.txid, 'hex'), paymentUtxo.vout, Script.from_hex(''));
    //   cancelTx.add_input(utxoIn);

    //   const destinationAddress = P2PKHAddress.from_string(this.keysService.ordAddress);
    //   const satOut = new TxOut(BigInt(1), destinationAddress.get_locking_script());
    //   cancelTx.add_output(satOut);

    //   const changeOut = this.createChangeOutput(cancelTx, fundingAndChangeAddress, paymentUtxo.satoshis);
    //   cancelTx.add_output(changeOut);

    //   // sign listing to cancel
    //   const sig = cancelTx.sign(
    //     ordinalPk,
    //     SigHash.SINGLE | SigHash.ANYONECANPAY | SigHash.FORKID,
    //     0,
    //     Script.from_bytes(Buffer.from(script, 'base64')),
    //     BigInt(1),
    //   );

    //   ordIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordinalPk.to_public_key().to_hex()} OP_1`));

    //   cancelTx.set_input(0, ordIn);

    //   const sig2 = cancelTx.sign(
    //     paymentPk,
    //     SigHash.ALL | SigHash.FORKID,
    //     1,
    //     P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script(),
    //     BigInt(paymentUtxo.satoshis),
    //   );

    //   utxoIn.set_unlocking_script(Script.from_asm_string(`${sig2.to_hex()} ${paymentPk.to_public_key().to_hex()}`));

    //   cancelTx.set_input(1, utxoIn);
    //   const rawTx = cancelTx.to_hex();

    //   const { txid } = await this.gorillaPoolService.broadcastWithGorillaPool(rawTx);
    //   if (!txid) return { error: 'broadcast-error' };
    return { txid: '' };
    // } catch (error) {
    //   console.log(error);
    //   return { error: JSON.stringify(error) };
    // }
  }

  purchaseGlobalOrderbookListing = async (purchaseOrdinal: PurchaseOrdinal & { password: string }) => {
    // try {
    // const { marketplaceAddress, marketplaceRate, outpoint, password } = purchaseOrdinal;
    // const isAuthenticated = await this.keysService.verifyPassword(password);
    // if (!isAuthenticated) {
    //   return { error: 'invalid-password' };
    // }
    // const keys = await this.keysService.retrieveKeys(password);

    // if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
    // const fundingAndChangeAddress = this.keysService.bsvAddress;

    // const fundingUtxos = await this.wocService.getAndUpdateUtxoStorage(fundingAndChangeAddress);

    // if (!fundingUtxos.length) {
    //   throw new Error('Could not retrieve funding UTXOs');
    // }

    // const payPk = PrivateKey.from_wif(keys.walletWif);
    // const listing = await this.gorillaPoolService.getUtxoByOutpoint(outpoint);
    // const price = Number(listing.data?.list?.price);
    // const payout = listing.data?.list?.payout;

    // if (!price || !payout) throw Error('Missing information!');
    // let satsIn = 0;
    // let satsOut = 0;

    // const purchaseTx = new Transaction(1, 0);

    // const listingInput = new TxIn(Buffer.from(listing.txid, 'hex'), listing.vout, Script.from_hex(''));
    // purchaseTx.add_input(listingInput);
    // satsIn += listing.satoshis;

    // // output 0
    // const buyerOutput = new TxOut(
    //   BigInt(1),
    //   P2PKHAddress.from_string(this.keysService.ordAddress).get_locking_script(),
    // );
    // purchaseTx.add_output(buyerOutput);
    // satsOut += 1;

    // // output 1
    // const payOutput = TxOut.from_hex(Buffer.from(payout, 'base64').toString('hex'));
    // purchaseTx.add_output(payOutput);
    // satsOut += price;

    // // output 2 - change
    // const dummyChangeOutput = new TxOut(
    //   BigInt(0),
    //   P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script(),
    // );
    // purchaseTx.add_output(dummyChangeOutput);

    // // output 3 - marketFee
    // const marketFee = Math.ceil(price * (marketplaceRate ?? 0));
    // const dummyMarketFeeOutput = new TxOut(
    //   BigInt(marketFee),
    //   P2PKHAddress.from_string(marketplaceAddress ?? '').get_locking_script(),
    // );
    // purchaseTx.add_output(dummyMarketFeeOutput);
    // satsOut += marketFee;

    // const listingScript = listing.script;
    // if (!listingScript) throw Error('No listing script');
    // let preimage = purchaseTx.sighash_preimage(
    //   SigHash.InputOutput,
    //   0,
    //   Script.from_bytes(Buffer.from(listingScript, 'hex')),
    //   BigInt(1), //TODO: use amount from listing
    // );

    // listingInput.set_unlocking_script(
    //   Script.from_asm_string(
    //     `${purchaseTx.get_output(0)?.to_hex()} ${purchaseTx.get_output(2)?.to_hex()}${purchaseTx
    //       .get_output(3)
    //       ?.to_hex()} ${Buffer.from(preimage).toString('hex')} OP_0`,
    //   ),
    // );
    // purchaseTx.set_input(0, listingInput);

    // let size = purchaseTx.to_bytes().length + P2PKH_INPUT_SIZE + P2PKH_OUTPUT_SIZE;
    // let fee = Math.ceil(size * FEE_PER_BYTE);
    // const inputs: UTXO[] = [];
    // while (satsIn < satsOut + fee) {
    //   const utxo = fundingUtxos.pop();
    //   if (!utxo) {
    //     return { error: 'insufficient-funds' };
    //   }
    //   const fundingInput = new TxIn(Buffer.from(utxo.txid, 'hex'), utxo.vout, Script.from_hex(utxo.script));
    //   purchaseTx.add_input(fundingInput);
    //   inputs.push(utxo);
    //   satsIn += utxo.satoshis;
    //   size += P2PKH_INPUT_SIZE;
    //   fee = Math.ceil(size * FEE_PER_BYTE);
    // }

    // const changeAmt = satsIn - (satsOut + fee);
    // const changeOutput = new TxOut(
    //   BigInt(changeAmt),
    //   P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script(),
    // );

    // purchaseTx.set_output(2, changeOutput);

    // preimage = purchaseTx.sighash_preimage(
    //   SigHash.InputOutputs,
    //   0,
    //   Script.from_bytes(Buffer.from(listingScript, 'hex')),
    //   BigInt(1),
    // );

    // listingInput.set_unlocking_script(
    //   Script.from_asm_string(
    //     `${purchaseTx.get_output(0)?.to_hex()} ${purchaseTx.get_output(2)?.to_hex()}${purchaseTx
    //       .get_output(3)
    //       ?.to_hex()} ${Buffer.from(preimage).toString('hex')} OP_0`,
    //   ),
    // );
    // purchaseTx.set_input(0, listingInput);

    // inputs.forEach((utxo, idx) => {
    //   const fundingInput = purchaseTx.get_input(idx + 1);
    //   const sig = purchaseTx.sign(
    //     payPk,
    //     SigHash.InputOutputs,
    //     1 + idx,
    //     Script.from_hex(utxo.script),
    //     BigInt(utxo.satoshis),
    //   );

    //   if (!fundingInput) throw Error('No funding input');

    //   fundingInput.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${payPk.to_public_key().to_hex()}`));

    //   purchaseTx.set_input(1 + idx, fundingInput);
    // });

    // const rawTx = purchaseTx.to_hex();

    // const broadcastRes = await this.gorillaPoolService.broadcastWithGorillaPool(rawTx);
    // if (!broadcastRes.txid) return { error: 'broadcast-error' };
    // return { txid: broadcastRes.txid };
    // } catch (error) {
    //   console.log(error);
    //   return { error: JSON.stringify(error) };
    // }
    return { txid: '', error: undefined };
  };

  getTokenName(b: Bsv20): string {
    return b.sym || b.tick || 'Null';
  }
}
