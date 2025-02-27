import { KeysService } from './Keys.service';
import { ListOrdinal, MultiSendOrdinals, OrdOperationResponse } from './types/ordinal.types';
import {
  cancelOrdListings,
  createOrdListings,
  OrdP2PKH,
  purchaseOrdListing,
  purchaseOrdTokenListing,
  TokenType,
  TokenUtxo,
  transferOrdTokens,
  sendOrdinals,
  Utxo,
  Destination,
} from 'js-1sat-ord';
import { Bsv20, Ordinal, PaginatedOrdinalsResponse, PurchaseOrdinal } from 'yours-wallet-provider';
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Script, Transaction, Utils } from '@bsv/sdk';
import { BsvService } from './Bsv.service';
import { BSV20_INDEX_FEE } from '../utils/constants';
import { mapOrdinal } from '../utils/providerHelper';
import { SPVStore, Outpoint, TxoLookup, TxoSort } from 'spv-store';
import { isValidEmail } from '../utils/tools';
//@ts-ignore
import { PaymailClient } from '@bsv/paymail/client';
import { ChromeStorageService } from './ChromeStorage.service';
import { truncate } from '../utils/format';
import { theme } from '../theme';
import { GorillaPoolService } from './GorillaPool.service';
import { Token } from './types/gorillaPool.types';

const client = new PaymailClient();

export class OrdinalService {
  constructor(
    private readonly keysService: KeysService,
    private readonly bsvService: BsvService,
    private readonly oneSatSPV: SPVStore,
    private readonly chromeStorageService: ChromeStorageService,
    private readonly gorillaPoolService: GorillaPoolService,
  ) {}

  getOrdinals = async (from = ''): Promise<PaginatedOrdinalsResponse> => {
    const ordinals = await this.oneSatSPV.search(new TxoLookup('origin', 'type'), TxoSort.DESC, 50, from);
    const mapped = ordinals.txos
      .filter(
        (o) =>
          o.data?.origin?.data?.insc?.file?.type !== 'panda/tag' &&
          o.data?.origin?.data?.insc?.file?.type !== 'yours/tag',
      )
      .map(mapOrdinal);
    return {
      ordinals: mapped,
      from: ordinals.nextPage,
    };
  };

  getOrdinal = async (outpoint: string): Promise<Ordinal | undefined> => {
    const txo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
    if (!txo) return;
    return mapOrdinal(txo);
  };

  getBsv20s = async (): Promise<Bsv20[]> => {
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

      const fundResults = await this.bsvService.fundingTxos();

      let satsIn = 0;
      let fee = 0;
      const feeModel = new SatoshisPerKilobyte(this.chromeStorageService.getCustomFeeRate());
      for await (const u of fundResults || []) {
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

  transferOrdinalsMulti = async (multiSend: MultiSendOrdinals): Promise<OrdOperationResponse> => {
    try {
      const { outpoints, destinationAddresses, password } = multiSend;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);
      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      const fundResults = await this.bsvService.fundingTxos();
      const outpointObjects = outpoints.map((outpoint) => new Outpoint(outpoint));
      const ordUtxos = await this.oneSatSPV.getTxos(outpointObjects);

      const { activeUtxos, destinations }: { activeUtxos: Utxo[]; destinations: Destination[] } = ordUtxos.reduce(
        (acc: { activeUtxos: Utxo[]; destinations: Destination[] }, txo, index) => {
          if (txo) {
            const pk = pkMap.get(txo.owner || '');
            if (!pk) return acc;
            // Only process active UTXOs
            acc.activeUtxos.push({
              txid: txo.outpoint.txid,
              vout: txo.outpoint.vout,
              satoshis: 1,
              script: Buffer.from(txo.script).toString('base64'),
              pk,
            });
            acc.destinations.push({
              address: destinationAddresses[index],
            });
          }
          return acc;
        },
        { activeUtxos: [], destinations: [] },
      );

      const paymentUtxos: Utxo[] = [];
      fundResults.forEach((t) => {
        const pk = pkMap.get(t.owner || '');
        if (!pk) return;
        paymentUtxos.push({
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
          pk,
        });
      });

      const { tx } = await sendOrdinals({
        paymentUtxos,
        ordinals: activeUtxos,
        destinations: destinations,
        changeAddress: keys.walletAddress,
      });

      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }
      return { error: 'broadcast-failed' };
    } catch (error: unknown) {
      console.log(error);
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
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);
      const fundingUtxos = (await this.bsvService.fundingTxos()).map((t) => ({
        txid: t.outpoint.txid,
        vout: t.outpoint.vout,
        satoshis: Number(t.satoshis),
        script: Utils.toBase64(t.script),
        pk: pkMap.get(t.owner || ''),
      }));

      const tokenType = idOrTick.length > 64 ? TokenType.BSV21 : TokenType.BSV20;

      const tokenDetails = await this.gorillaPoolService.getBsv20Details(idOrTick);

      const bsv20Utxos = await this.gorillaPoolService.getBSV20Utxos(idOrTick, [keys.ordAddress, keys.walletAddress]);
      if (!bsv20Utxos || bsv20Utxos.length === 0) return { error: 'no-bsv20-utxo' };

      const tokenUtxos: TokenUtxo[] = [];
      let tokensIn = 0n;
      for (const tokenUtxo of bsv20Utxos) {
        if (tokensIn >= amount) break;
        if (!pkMap.has(tokenUtxo.owner || '')) {
          continue;
        }
        const t: TokenUtxo = {
          id: tokenUtxo.id || tokenUtxo.tick || idOrTick,
          txid: tokenUtxo.txid,
          vout: tokenUtxo.vout,
          satoshis: 1,
          script: tokenUtxo.script || '',
          amt: tokenUtxo.amt,
          pk: pkMap.get(tokenUtxo.owner || ''),
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
        utxos: fundingUtxos,
        changeAddress: keys.walletAddress,
        tokenChangeAddress: keys.ordAddress,
      });

      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid, rawTx: tx.toHex() };
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
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      const fundingUtxos = (await this.bsvService.fundingTxos()).map((t) => ({
        txid: t.outpoint.txid,
        vout: t.outpoint.vout,
        satoshis: Number(t.satoshis),
        script: Utils.toBase64(t.script),
        pk: pkMap.get(t.owner || ''),
      }));

      const ordUtxo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!ordUtxo) return { error: 'no-ord-utxo' };

      if (!pkMap.has(ordUtxo.owner || '')) {
        return { error: '' }; // default error
      }

      const { tx } = await createOrdListings({
        ordPk,
        paymentPk,
        utxos: fundingUtxos,
        listings: [
          {
            listingUtxo: {
              txid: ordUtxo.outpoint.txid,
              vout: ordUtxo.outpoint.vout,
              satoshis: Number(ordUtxo.satoshis),
              script: Buffer.from(ordUtxo.script).toString('base64'),
              pk: pkMap.get(ordUtxo.owner || ''),
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
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
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
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      const fundingUtxos = (await this.bsvService.fundingTxos()).map((t) => ({
        txid: t.outpoint.txid,
        vout: t.outpoint.vout,
        satoshis: Number(t.satoshis),
        script: Utils.toBase64(t.script),
        pk: pkMap.get(t.owner || ''),
      }));

      const listingUtxo = await this.oneSatSPV.getTxo(new Outpoint(outpoint));
      if (!listingUtxo) return { error: 'no-ord-utxo' };

      if (!pkMap.has(listingUtxo.owner || '')) {
        return { error: '' }; // default error
      }

      const { tx } = await cancelOrdListings({
        ordPk,
        paymentPk,
        utxos: fundingUtxos,
        listingUtxos: [
          {
            txid: listingUtxo.outpoint.txid,
            vout: listingUtxo.outpoint.vout,
            satoshis: Number(listingUtxo.satoshis),
            script: Buffer.from(listingUtxo.script).toString('base64'),
            pk: pkMap.get(listingUtxo.owner || ''),
          },
        ],
      });

      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
      return { error: JSON.stringify(error) };
    }
  };

  purchaseGlobalOrderbookListing = async (
    purchaseOrdinal: PurchaseOrdinal & { password: string },
    listingTxo: Ordinal,
    tokenDetail?: Token,
  ) => {
    try {
      const { marketplaceAddress, marketplaceRate, password } = purchaseOrdinal;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
      const fundResults = await this.bsvService.fundingTxos();

      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      console.log('listingTxo', listingTxo);
      if (!listingTxo) return { error: 'no-ord-utxo' };

      if (!listingTxo?.data.list) {
        return { error: 'no-listing-data' };
      }

      const price = Number(listingTxo.data?.list?.price);
      const payout = listingTxo.data?.list?.payout;
      if (!payout) return { error: 'bad-listing' };

      const additionalPayments: { to: string; amount: number }[] = [];
      const marketFee = Math.ceil(price * (marketplaceRate ?? 0));

      if (marketFee > 0) {
        additionalPayments.push({
          to: marketplaceAddress ?? '',
          amount: marketFee,
        });
      }
      let tx: Transaction = new Transaction();
      const utxos: Utxo[] = [];
      fundResults.forEach((t) => {
        const pk = pkMap.get(t.owner || '');
        if (!pk) return;
        utxos.push({
          txid: t.outpoint.txid,
          vout: t.outpoint.vout,
          satoshis: Number(t.satoshis),
          script: Buffer.from(t.script).toString('base64'),
          pk,
        });
      });
      console.log('utxos:', utxos);
      if (listingTxo.script && listingTxo?.data?.bsv20) {
        if (!tokenDetail) return { error: 'no-token-details' };

        additionalPayments.push({
          to: tokenDetail.fundAddress,
          amount: BSV20_INDEX_FEE,
        });

        const res = await purchaseOrdTokenListing({
          protocol: listingTxo.data.bsv20.id ? TokenType.BSV21 : TokenType.BSV20,
          ordAddress: this.keysService.ordAddress,
          utxos,
          tokenID: listingTxo.data.bsv20.id || listingTxo.data.bsv20.tick || '',
          changeAddress: keys.walletAddress,
          listingUtxo: {
            txid: listingTxo.txid,
            vout: listingTxo.vout,
            satoshis: 1,
            script: listingTxo.script,
            payout,
            price,
            amt: String(listingTxo.data.bsv20.amt),
            id: listingTxo.data.bsv20.id || listingTxo.data.bsv20.tick || '',
          },
          additionalPayments,
        });
        tx = res.tx;
      } else if (listingTxo.script) {
        const res = await purchaseOrdListing({
          ordAddress: this.keysService.ordAddress,
          changeAddress: keys.walletAddress,
          utxos,
          listing: {
            payout,
            listingUtxo: {
              txid: listingTxo.txid,
              vout: listingTxo.vout,
              satoshis: 1,
              script: listingTxo.script,
            },
          },
          additionalPayments,
        });
        tx = res.tx;
      }

      const response = await this.oneSatSPV.broadcast(tx);
      if (response?.txid) {
        return { txid: response.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
      return { error: JSON.stringify(error) };
    }
  };

  getTokenName(b: Bsv20): string {
    return b.sym || b.tick || 'Null';
  }
}
