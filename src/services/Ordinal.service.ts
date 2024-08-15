import { GorillaPoolService } from './GorillaPool.service';
import { KeysService } from './Keys.service';
import { ListOrdinal, OrdOperationResponse } from './types/ordinal.types';
import {
  cancelOrdListings,
  createOrdListings,
  purchaseOrdListing,
  sendOrdinals,
  TokenType,
  TokenUtxo,
  transferOrdTokens,
} from 'js-1sat-ord';
import { Bsv20, Bsv21, BSV20Txo, Ordinal, PurchaseOrdinal } from 'yours-wallet-provider';
import { Bsv21 as Bsv21Type } from './txo-store/mods/bsv21';
import { ChromeStorageService } from './ChromeStorage.service';
import { TxoStore } from './txo-store';
import { PrivateKey } from '@bsv/sdk';
import { BsvService } from './Bsv.service';
import { BSV20_INDEX_FEE, FEE_PER_KB } from '../utils/constants';
import { TxoLookup } from './txo-store/models/txo';
import { mapOrdinal } from '../utils/providerHelper';

export class OrdinalService {
  constructor(
    private readonly keysService: KeysService,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly bsvService: BsvService,
    private readonly txoStore: TxoStore,
  ) {
  }

  getOrdinals = async (): Promise<Ordinal[]> => {
    const ordinals = await this.txoStore.searchTxos(new TxoLookup('ord'), 0);
    // const ordinals = await this.txoStore.searchTxos(new TxoLookup('ord', 'address', this.keysService.ordAddress), 0);
    return ordinals.txos.map(mapOrdinal);
  };

  getOrdinal = async (outpoint: string): Promise<Ordinal | undefined> => {
    const [txid, vout] = outpoint.split('_');
    const txo = await this.txoStore.getTxo(txid, parseInt(vout, 10));
    if (!txo) return;
    return mapOrdinal(txo);
  };

  getBsv20s = async (): Promise<Bsv21[]> => {
    const bsv20s = await this.txoStore.searchTxos(new TxoLookup('bsv21'), 0);
    // const bsv20s = await this.txoStore.searchTxos(new TxoLookup('bsv21', 'address', this.keysService.ordAddress), 0);

    const tokens: { [id: string]: Bsv21 } = {};
    for (const txo of bsv20s.txos) {
      const bsv21 = txo.data.bsv21?.data as Bsv21Type;
      if (!bsv21) continue;
      let token = tokens[bsv21.id];
      if (!token) {
        token = {
          p: 'bsv-20',
          op: 'deploy+mint',
          dec: bsv21.dec,
          amt: bsv21.supply?.toString() || '',
          all: { confirmed: 0n, pending: 0n },
          listed: { confirmed: 0n, pending: 0n },
          status: 1,
          icon: bsv21.icon,
          id: bsv21.id || '',
          sym: bsv21.sym || '',
        };
        tokens[bsv21.id] = token;
      }
      token.all.confirmed += bsv21.amt;
      if (!txo.data.list) continue;
      token.listed.confirmed += bsv21.amt;
    }
    return Object.values(tokens);
  };

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
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        throw Error('No keys');
      }
      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);
      const fundingUtxos = await this.bsvService.fundingTxos();

      const bsv21Utxos = await this.txoStore.searchTxos(new TxoLookup('bsv21', 'id', id), 0);
      const tokenUtxos: TokenUtxo[] = [];
      let tokensIn = 0n;
      let bsv21: Bsv21Type | undefined;
      for (const tokenUtxo of bsv21Utxos.txos) {
        if (tokensIn >= amount) break;
        if (tokenUtxo.data?.list || !tokenUtxo.data.bsv21?.data) continue;
        bsv21 = tokenUtxo.data.bsv21.data as Bsv21Type;
        tokenUtxos.push({
          txid: tokenUtxo.txid,
          vout: tokenUtxo.vout,
          satoshis: 1,
          script: Buffer.from(tokenUtxo.script).toString('base64'),
          amt: bsv21.amt.toString(),
          id: bsv21.id,
        });
        tokensIn += bsv21.amt;
      }
      if (tokensIn < amount) {
        return { error: 'insufficient-funds' };
      }

      const { tx } = await transferOrdTokens({
        distributions: [{ address: destinationAddress, amt: Number(amount) }],
        inputTokens: tokenUtxos,
        decimals: 0,
        tokenID: id,
        protocol: TokenType.BSV21,
        utxos: fundingUtxos.map((t) => ({
          txid: t.txid,
          vout: t.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        ordPk,
        paymentPk,
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
        new TxoLookup('fund'),
        // new TxoLookup('fund', 'address', this.keysService.bsvAddress),
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
        new TxoLookup('fund'),
        // new TxoLookup('fund', 'address', this.keysService.bsvAddress),
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
        new TxoLookup('fund'),
        // new TxoLookup('fund', 'address', this.keysService.bsvAddress),
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
    return (b as Bsv21).sym || (b as Bsv20).tick || 'Null';
  }
}
