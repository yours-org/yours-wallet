import { KeysService } from './Keys.service';
import { ListOrdinal, OrdOperationResponse } from './types/ordinal.types';
import {
  cancelOrdListings,
  createOrdListings,
  OrdP2PKH,
  purchaseOrdListing,
  TokenType,
  TokenUtxo,
  transferOrdTokens,
} from 'js-1sat-ord';
import { Bsv20, Bsv21, Ordinal, PurchaseOrdinal } from 'yours-wallet-provider';
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Script, Transaction } from '@bsv/sdk';
import { BsvService } from './Bsv.service';
//TODO: look into why BSV20_INDEX_FEE is not being used
import { BSV20_INDEX_FEE, FEE_PER_KB } from '../utils/constants';
import { mapOrdinal } from '../utils/providerHelper';
import { Bsv20 as Bsv20Type, Bsv21 as Bsv21Type, SPVStore, Outpoint, TxoLookup, TxoSort } from 'spv-store';
import { isValidEmail } from '../utils/tools';
//@ts-ignore
import { PaymailClient } from '@bsv/paymail/client';
import { ChromeStorageService } from './ChromeStorage.service';
import { truncate } from '../utils/format';
import theme from '../theme.json';
import { GorillaPoolService } from './GorillaPool.service';

const client = new PaymailClient();

export class OrdinalService {
  constructor(
    private readonly keysService: KeysService,
    private readonly bsvService: BsvService,
    private readonly oneSatSPV: SPVStore,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly gorillaPoolService: GorillaPoolService,
  ) {}

  getOrdinals = async (): Promise<Ordinal[]> => {
    const ordinals = await this.oneSatSPV.search(new TxoLookup('origin'), TxoSort.DESC, 0);
    const mapped = ordinals.txos.map(mapOrdinal);
    return mapped;
  };

  getOrdinal = async (outpoint: string): Promise<Ordinal | undefined> => {
    const txo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
    if (!txo) return;
    return mapOrdinal(txo);
  };

  getBsv20s = async (): Promise<(Bsv20 | Bsv21)[]> => {
    return this.gorillaPoolService.getBsv20Balances([this.keysService.bsvAddress, this.keysService.ordAddress]);
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

      const ordinal = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!ordinal) {
        return { error: 'no-ordinal' };
      }

      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        return { error: 'no-keys' };
      }

      const changeAddress = keys.walletAddress;
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      // Build tx
      const tx = new Transaction();
      const paymailRefs: { paymail: string; reference: string }[] = [];
      const u = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!u) return { error: 'no-ordinal' };
      const pk = pkMap.get(u.owner || '');
      if (!pk) return { error: 'no-keys' };
      const sourceTransaction = await this.oneSatSPV.getTx(u.outpoint.txid);
      if (!sourceTransaction) {
        console.log(`Could not find source transaction ${u.outpoint.txid}`);
        return { error: 'source-tx-not-found' };
      }
      tx.addInput({
        sourceTransaction,
        sourceOutputIndex: u.outpoint.vout,
        sequence: 0xffffffff,
        unlockingScriptTemplate: new OrdP2PKH().unlock(pk),
      });

      if (isValidEmail(destinationAddress)) {
        const p2pDestination = await client.getP2pOrdinalDestinations(destinationAddress, 1);
        console.log(`P2P payment destination: ${p2pDestination}`);
        paymailRefs.push({ paymail: destinationAddress, reference: p2pDestination.reference });

        tx.addOutput({
          satoshis: 1,
          lockingScript: Script.fromHex(p2pDestination.outputs[0].script),
        });
      } else {
        tx.addOutput({ satoshis: 1, lockingScript: new OrdP2PKH().lock(destinationAddress) });
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
        const sourceTransaction = await this.oneSatSPV.getTx(u.outpoint.txid);
        if (!sourceTransaction) {
          console.log(`Could not find source transaction ${u.outpoint.txid}`);
          return { error: 'source-tx-not-found' };
        }
        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: u.outpoint.vout,
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(pk),
        });
        satsIn += Number(u.satoshis);
        fee = await feeModel.computeFee(tx);
        if (satsIn >= fee) break;
      }
      if (satsIn < fee) return { error: 'insufficient-funds' };
      await tx.fee(feeModel);
      await tx.sign();

      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      const txHex = tx.toHex();
      const chromeObj = this.chromeStorageService.getCurrentAccountObject();
      if (!chromeObj.account) return { error: 'no-account' };
      for (const ref of paymailRefs) {
        console.log(`Sending P2P payment to ${ref.paymail} with reference ${ref.reference}`);
        await client.sendOrdinalTransactionP2P(ref.paymail, txHex, ref.reference, {
          sender: `${theme.settings.walletName} - ${truncate(chromeObj.account.addresses.bsvAddress, 4, 4)}`,
          note: `P2P tx from ${theme.settings.walletName}`,
        });
      }

      return { error: 'broadcast-failed' };
    } catch (error) {
      console.error('transferOrdinal failed:', error);
      return { error: JSON.stringify(error) };
    }
  };

  sendBSV20 = async (idOrTick: string, destinationAddress: string, amount: bigint, password: string) => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        return { error: 'no-keys' };
      }
      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);
      const fundingUtxos = await this.bsvService.fundingTxos();

      const tokenType = idOrTick.length > 64 ? TokenType.BSV21 : TokenType.BSV20;

      const tokenDetails = await this.gorillaPoolService.getBsv20Details(idOrTick);

      const bsv20Utxos = await this.gorillaPoolService.getBSV20Utxos(idOrTick, [keys.ordAddress, keys.walletAddress]);
      if (!bsv20Utxos || bsv20Utxos.length === 0) throw Error('no-bsv20-utxo');

      const tokenUtxos: TokenUtxo[] = [];
      let tokensIn = 0n;
      let token: Bsv20Type | Bsv21Type | undefined;
      for (const tokenUtxo of bsv20Utxos) {
        if (tokensIn >= amount) break;
        // token = tokenUtxo.data.bsv21.data as Bsv20Type | Bsv21Type;
        const t: TokenUtxo = {
          id: tokenType === TokenType.BSV21 ? (token as Bsv21Type).id : (token as Bsv20Type).tick,
          txid: tokenUtxo.txid,
          vout: tokenUtxo.vout,
          satoshis: 1,
          script: Buffer.from(tokenUtxo.script!).toString('base64'),
          amt: tokenUtxo.amt,
        };
        tokenUtxos.push(t);
        tokensIn += BigInt(tokenUtxo.amt);
      }
      if (tokensIn < amount) {
        return { error: 'insufficient-funds' };
      }

      const { tx } = await transferOrdTokens({
        distributions: [{ address: destinationAddress, tokens: Number(amount) }],
        inputTokens: tokenUtxos,
        decimals: 0,
        tokenID: idOrTick,
        protocol: tokenType,
        additionalPayments: [
          {
            to: tokenDetails?.fundAddress || '',
            amount: BSV20_INDEX_FEE * 2,
          },
        ],
        utxos: fundingUtxos.map((t) => ({
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        ordPk,
        paymentPk,
      });

      const response = await this.oneSatSPV.broadcast(tx);
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

      const fundResults = await this.oneSatSPV.search(new TxoLookup('fund'));
      const ordUtxo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!ordUtxo) return { error: 'no-ord-utxo' };

      const { tx } = await createOrdListings({
        ordPk,
        paymentPk,
        utxos: fundResults.txos.map((t) => ({
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listings: [
          {
            listingUtxo: {
              txid: ordUtxo.outpoint.txid,
              vout: ordUtxo.outpoint.vout,
              satoshis: Number(ordUtxo.satoshis),
              script: Buffer.from(ordUtxo.script).toString('base64'),
            },
            price: Number(price),
            payAddress: this.keysService.bsvAddress,
            ordAddress: this.keysService.ordAddress,
          },
        ],
      });

      const response = await this.oneSatSPV.broadcast(tx);
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
      const fundResults = await this.oneSatSPV.search(new TxoLookup('fund'));

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      const listingUtxo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!listingUtxo) return { error: 'no-ord-utxo' };

      const { tx } = await cancelOrdListings({
        ordPk,
        paymentPk,
        utxos: fundResults.txos.map((t) => ({
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listingUtxos: [
          {
            txid: listingUtxo.outpoint.txid,
            vout: listingUtxo.outpoint.vout,
            satoshis: Number(listingUtxo.satoshis),
            script: Buffer.from(listingUtxo.script).toString('base64'),
          },
        ],
      });

      const response = await this.oneSatSPV.broadcast(tx);
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
      const fundResults = await this.oneSatSPV.search(new TxoLookup('fund'));

      const paymentPk = PrivateKey.fromWif(keys.walletWif);

      const listingTxo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
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
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
        })),
        listing: {
          payout: payout,
          listingUtxo: {
            txid: listingTxo.outpoint.txid,
            vout: listingTxo.outpoint.vout,
            satoshis: Number(listingTxo.satoshis),
            script: Buffer.from(listingTxo.script).toString('base64'),
          },
        },
        additionalPayments,
      });

      const response = await this.oneSatSPV.broadcast(tx);
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
