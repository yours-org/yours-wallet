import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';
import {
  BSV20Data,
  BuildAndBroadcastResponse,
  ListOrdinal,
  OrdinalData,
  OrdOperationResponse,
} from './types/ordinal.types';
import { cancelOrdListings, createOrdListings, purchaseOrdListing, sendOrdinals } from 'js-1sat-ord';
import { Bsv20, Bsv21, Ordinal, PurchaseOrdinal } from 'yours-wallet-provider';
import { UTXO } from './types/bsv.types';
import { ChromeStorageService } from './ChromeStorage.service';
import { TxoStore } from './txo-store';
import { PrivateKey, Transaction } from '@bsv/sdk';
import { BsvService } from './Bsv.service';
import { FEE_PER_KB } from '../utils/constants';
import { TxoLookup } from './txo-store/models/txo';
import { error } from 'console';
import { mapOrdinal } from '../utils/providerHelper';

export class OrdinalService {
  // private ordinals: OrdinalData;
  private bsv20s: BSV20Data;
  constructor(
    private readonly keysService: KeysService,
    private readonly gorillaPoolService: GorillaPoolService,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly bsvService: BsvService,
    private readonly txoStore: TxoStore,
  ) {
    // this.ordinals = { initialized: false, data: [] };
    this.bsv20s = { initialized: false, data: [] };
  }

  getOrdinals = async (): Promise<Ordinal[]> => {
    const ordinals = await this.txoStore.searchTxos(
      new TxoLookup('ord', 'address', this.keysService.ordAddress, false),
      0,
    );
    return ordinals.txos.map(mapOrdinal);
  };

  getOrdinal = async (outpoint: string): Promise<Ordinal | undefined> => {
    const [txid, vout] = outpoint.split('_');
    const txo = await this.txoStore.getTxo(txid, parseInt(vout, 10));
    if (!txo) return;
    return mapOrdinal(txo);
  };

  getBsv20s = (): BSV20Data => this.bsv20s;

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
    try {
      const { outpoint, price, password } = listing;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      const fundResults = await this.txoStore.searchTxos(
        new TxoLookup('fund', 'address', this.keysService.bsvAddress, false),
        0,
      );

      const [ordTxid, vout] = outpoint.split('_');
      const ordUtxo = await this.txoStore.getTxo(ordTxid, parseInt(vout));
      if (!ordUtxo) return { error: 'no-ord-utxo' };

      const { tx } = await createOrdListings({
        ordPk,
        paymentPk,
        utxos: fundResults.txos.map((t) => ({
          txid: t.txid,
          vout: t.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listings: [
          {
            listingUtxo: {
              txid: ordUtxo.txid,
              vout: ordUtxo.vout,
              satoshis: Number(ordUtxo.satoshis),
              script: Buffer.from(ordUtxo.script).toString('base64'),
            },
            price: Number(price),
            payAddress: this.keysService.bsvAddress,
            ordAddress: this.keysService.ordAddress,
          },
        ],
        //TODO: figure out royalty
        royalty: 0,
      });

      const response = await this.txoStore.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error: any) {
      console.log(error);
      if (error.message?.includes('Not enough funds')) return { error: 'insufficient-funds' };
      return { error: JSON.stringify(error) };
    }
  };

  cancelGlobalOrderbookListing = async (outpoint: string, password: string): Promise<OrdOperationResponse> => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
      const fundResults = await this.txoStore.searchTxos(
        new TxoLookup('fund', 'address', this.keysService.bsvAddress, false),
        0,
      );

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      const [listingTxid, vout] = outpoint.split('_');
      if (!listingTxid) {
        throw new Error('No listing txid');
      }
      const listingUtxo = await this.txoStore.getTxo(listingTxid, parseInt(vout));
      if (!listingUtxo) return { error: 'no-ord-utxo' };

      const { tx } = await cancelOrdListings({
        ordPk,
        paymentPk,
        utxos: fundResults.txos.map((t) => ({
          txid: t.txid,
          vout: t.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listingUtxos: [
          {
            txid: listingUtxo.txid,
            vout: listingUtxo.vout,
            satoshis: Number(listingUtxo.satoshis),
            script: Buffer.from(listingUtxo.script).toString('base64'),
          },
        ],
      });

      const response = await this.txoStore.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error: any) {
      console.log(error);
      if (error.message?.includes('Not enough funds')) return { error: 'insufficient-funds' };
      return { error: JSON.stringify(error) };
    }
  };

  purchaseGlobalOrderbookListing = async (purchaseOrdinal: PurchaseOrdinal & { password: string }) => {
    try {
      const { marketplaceAddress, marketplaceRate, outpoint, password } = purchaseOrdinal;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
      const fundResults = await this.txoStore.searchTxos(
        new TxoLookup('fund', 'address', this.keysService.bsvAddress, false),
        0,
      );

      const paymentPk = PrivateKey.fromWif(keys.walletWif);

      const [listingTxid, vout] = outpoint.split('_');
      const listingTxo = await this.txoStore.getTxo(listingTxid, parseInt(vout));
      if (!listingTxo) return { error: 'no-ord-utxo' };

      if (!listingTxo?.data.list) {
        return { error: 'no-listing-data' };
      }

      const price = Number(listingTxo.data?.list?.data.price);
      const payout = listingTxo.data?.list?.data.payout;
      if (!payout) return { error: 'bad-listing' };

      const additionalPayments: { to: string; amount: number }[] = [];
      const marketFee = Math.ceil(price * (marketplaceRate ?? 0));

      if (marketFee > 0) {
        additionalPayments.push({
          to: marketplaceAddress ?? '',
          amount: marketFee,
        });
      }
      const { tx } = await purchaseOrdListing({
        ordAddress: this.keysService.ordAddress,
        paymentPk,
        utxos: fundResults.txos.map((t) => ({
          txid: t.txid,
          vout: t.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listing: {
          payout: payout,
          listingUtxo: {
            txid: listingTxo.txid,
            vout: listingTxo.vout,
            satoshis: Number(listingTxo.satoshis),
            script: Buffer.from(listingTxo.script).toString('base64'),
          },
        },
        additionalPayments,
      });

      const response = await this.txoStore.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error: any) {
      console.log(error);
      if (error.message?.includes('Not enough funds')) return { error: 'insufficient-funds' };
      return { error: JSON.stringify(error) };
    }
  };

  getTokenName(b: Bsv20 | Bsv21): string {
    return (b as Bsv21).sym || b.tick || 'Null';
  }
}
